import { useState, useEffect } from "react";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "./AdminDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import { 
  User, 
  Wallet,
  Activity,
  Clock,
  Brain,
  Trophy,
  BarChart3,
  Target,
  AlertTriangle,
  TrendingUp,
  ArrowDownToLine,
  Gamepad2,
  X,
  Settings
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { PasswordChangeSection } from "./PasswordChangeSection";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "../../contexts/AuthContext";
import { md5Hash } from "../../lib/investApi";

interface UserDetailModalProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
}

interface TransactionRecord {
  id: string;
  transaction_type: string;
  amount: number;
  status: string;
  created_at: string;
  notes?: string;
}

interface BettingRecord {
  id: string;
  game_id: number;
  provider_id: number;
  bet_amount: number;
  win_amount: number;
  played_at: string;
  game_title?: string;
  provider_name?: string;
}

export function UserDetailModal({ user, isOpen, onClose }: UserDetailModalProps) {
  const { t } = useLanguage();
  const { authState } = useAuth();
  const [activeTab, setActiveTab] = useState("basic");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [bettingHistory, setBettingHistory] = useState<BettingRecord[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  
  const [stats, setStats] = useState({
    totalDeposit: 0,
    totalWithdraw: 0,
    totalBets: 0,
    totalWinAmount: 0,
    accountAge: 0,
    lastActivity: '',
    gameCount: 0,
    winRate: 0
  });

  // 에볼루션 설정 state
  const [evolutionLimit, setEvolutionLimit] = useState<number>(100000000); // 기본값 1억
  const [currentEvolutionLimit, setCurrentEvolutionLimit] = useState<number | null>(null);
  const [evolutionLoading, setEvolutionLoading] = useState(false);
  const [hasInvestApi, setHasInvestApi] = useState<boolean>(false); // invest API 사용 여부

  // 커미션 수정 state
  const [editMode, setEditMode] = useState(false);
  const [commissionData, setCommissionData] = useState({
    casino_rolling_commission: 0,
    casino_losing_commission: 0,
    slot_rolling_commission: 0,
    slot_losing_commission: 0
  });

  // 메모 수정 state
  const [memoEditMode, setMemoEditMode] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [memoHistory, setMemoHistory] = useState<any[]>([]);
  const [showMemoHistory, setShowMemoHistory] = useState(false);

  // 출금 비밀번호 & 포인트전환 비밀번호 변경 state
  const [withdrawalPasswordEditMode, setWithdrawalPasswordEditMode] = useState(false);
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [pointConversionPassword, setPointConversionPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 커미션 저장 함수
  const saveCommission = async () => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('users')
        .update({
          casino_rolling_commission: parseFloat(commissionData.casino_rolling_commission.toString()),
          casino_losing_commission: parseFloat(commissionData.casino_losing_commission.toString()),
          slot_rolling_commission: parseFloat(commissionData.slot_rolling_commission.toString()),
          slot_losing_commission: parseFloat(commissionData.slot_losing_commission.toString()),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('커미션 설정이 저장되었습니다.');
      setEditMode(false);
      
      // 사용자 객체 업데이트 (모달 재렌더링을 위해)
      user.casino_rolling_commission = parseFloat(commissionData.casino_rolling_commission.toString());
      user.casino_losing_commission = parseFloat(commissionData.casino_losing_commission.toString());
      user.slot_rolling_commission = parseFloat(commissionData.slot_rolling_commission.toString());
      user.slot_losing_commission = parseFloat(commissionData.slot_losing_commission.toString());
      
    } catch (error) {
      console.error('커미션 저장 오류:', error);
      toast.error('커미션 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 메모 이력 조회 (user_logs 테이블 사용)
  const fetchMemoHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('user_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('action', 'memo_updated')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // description 필드를 파싱하여 메모 정보 추출
      const formattedHistory = (data || []).map(log => {
        try {
          const parsedDesc = JSON.parse(log.description || '{}');
          return {
            id: log.id,
            user_id: log.user_id,
            memo: parsedDesc.memo || '',
            created_by: parsedDesc.created_by || null,
            created_by_username: parsedDesc.created_by_username || '시스템',
            created_by_nickname: parsedDesc.created_by_nickname || null,
            created_at: log.created_at
          };
        } catch (e) {
          // 파싱 실패 시 기본값 사용
          return {
            id: log.id,
            user_id: log.user_id,
            memo: log.description || '',
            created_by: null,
            created_by_username: '시스템',
            created_by_nickname: null,
            created_at: log.created_at
          };
        }
      });
      
      setMemoHistory(formattedHistory);
    } catch (error) {
      console.error('❌ 메모 이력 조회 오류:', error);
    }
  };

  // 메모 저장 함수
  const saveMemo = async () => {
    try {
      setLoading(true);

      // 1. 사용자 테이블 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({
          memo: memoText || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // 2. 메모 이력 기록 (user_logs 사용)
      const { error: historyError } = await supabase
        .from('user_logs')
        .insert({
          user_id: user.id,
          action: 'memo_updated',
          description: JSON.stringify({
            memo: memoText || null,
            created_by: authState.user?.id,
            created_by_username: authState.user?.username || '시스템',
            created_by_nickname: authState.user?.nickname || null
          }),
          ip_address: null,
          created_at: new Date().toISOString()
        });

      if (historyError) throw historyError;

      toast.success('메모가 저장되었습니다.');
      setMemoEditMode(false);
      user.memo = memoText; // 사용자 객체 업데이트
      
      // 이력 새로고침
      await fetchMemoHistory();
      
    } catch (error) {
      console.error('메모 저장 오류:', error);
      toast.error('메모 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 출금/포인트전환 비밀번호 저장 함수
  const savePasswords = async () => {
    try {
      // 검증
      if (withdrawalPassword && !/^\d{4}$/.test(withdrawalPassword)) {
        toast.error('출금 비밀번호는 숫자 4자리로 입력해주세요.');
        return;
      }

      if (pointConversionPassword && !/^\d{4}$/.test(pointConversionPassword)) {
        toast.error('포인트전환 비밀번호는 숫자 4자리로 입력해주세요.');
        return;
      }

      if (!withdrawalPassword && !pointConversionPassword) {
        toast.error('변경할 비밀번호를 입력해주세요.');
        return;
      }

      setPasswordLoading(true);

      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (withdrawalPassword) {
        updateData.withdrawal_password = withdrawalPassword;
      }

      if (pointConversionPassword) {
        updateData.point_conversion_password = pointConversionPassword;
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      toast.success('비밀번호가 변경되었습니다.');
      setWithdrawalPasswordEditMode(false);
      setWithdrawalPassword('');
      setPointConversionPassword('');

      // 사용자 객체 업데이트
      if (withdrawalPassword) {
        user.withdrawal_password = withdrawalPassword;
      }
      if (pointConversionPassword) {
        user.point_conversion_password = pointConversionPassword;
      }

    } catch (error) {
      console.error('비밀번호 변경 오류:', error);
      toast.error('비밀번호 변경에 실패했습니다.');
    } finally {
      setPasswordLoading(false);
    }
  };
  
  // 기본 통계 계산
  const calculateStats = async () => {
    try {
      setLoading(true);

      // 입출금 통계
      const { data: txData } = await supabase
        .from('transactions')
        .select('transaction_type, amount, status')
        .eq('user_id', user.id);

      const totalDeposit = (txData || [])
        .filter(t => t.transaction_type === 'deposit' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const totalWithdraw = (txData || [])
        .filter(t => t.transaction_type === 'withdrawal' && t.status === 'approved')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      // 베팅 통계
      const { data: betData } = await supabase
        .from('game_records')
        .select('bet_amount, win_amount')
        .eq('user_id', user.id);

      const totalBets = (betData || []).reduce((sum, b) => sum + (b.bet_amount || 0), 0);
      const totalWinAmount = (betData || []).reduce((sum, b) => sum + (b.win_amount || 0), 0);
      const gameCount = betData?.length || 0;
      const winCount = (betData || []).filter(b => (b.win_amount || 0) > (b.bet_amount || 0)).length;
      const winRate = gameCount > 0 ? (winCount / gameCount * 100) : 0;

      // 계정 나이
      const accountAge = Math.floor(
        (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      // 최근 활동
      const { data: lastSession } = await supabase
        .from('game_launch_sessions')
        .select('launched_at')
        .eq('user_id', user.id)
        .order('launched_at', { ascending: false })
        .limit(1)
        .single();

      setStats({
        totalDeposit,
        totalWithdraw,
        totalBets,
        totalWinAmount,
        accountAge,
        lastActivity: lastSession?.launched_at || user.created_at,
        gameCount,
        winRate
      });

    } catch (error) {
      console.error('통계 계산 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 입출금 내역 조회
  const fetchTransactions = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setTransactions(data || []);
      
    } catch (error) {
      console.error('입출금 내역 조회 오류:', error);
      toast.error('입출금 내역을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 베팅 내역 조회
  const fetchBettingHistory = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('game_records')
        .select('*')
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setBettingHistory(data || []);
      
    } catch (error) {
      console.error('베팅 내역 조회 오류:', error);
      toast.error('베팅 내역을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // AI 게임 패턴 분석
  const analyzePattern = async () => {
    try {
      setLoading(true);

      const { data: bets } = await supabase
        .from('game_records')
        .select('*')
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
        .limit(500);

      if (!bets || bets.length === 0) {
        setAiAnalysis(null);
        return;
      }

      // 게임별 통계 집계
      const gameStats = new Map();
      bets.forEach(bet => {
        const gameKey = `${bet.game_id}_${bet.game_title || ''}`;
        if (!gameStats.has(gameKey)) {
          gameStats.set(gameKey, {
            gameName: bet.game_title || `게임 ${bet.game_id}`,
            providerName: bet.provider_name || '',
            count: 0,
            totalBet: 0,
            totalWin: 0,
            wins: 0
          });
        }
        const stat = gameStats.get(gameKey);
        stat.count++;
        stat.totalBet += bet.bet_amount || 0;
        stat.totalWin += bet.win_amount || 0;
        if ((bet.win_amount || 0) > (bet.bet_amount || 0)) stat.wins++;
      });

      const topGames = Array.from(gameStats.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(g => ({
          game: g.gameName,
          provider: g.providerName,
          count: g.count,
          winRate: g.count > 0 ? (g.wins / g.count * 100) : 0,
          netProfit: g.totalWin - g.totalBet
        }));

      // 시간대 패턴 분석
      const hourlyPattern = new Array(24).fill(0);
      bets.forEach(bet => {
        const hour = new Date(bet.played_at).getHours();
        hourlyPattern[hour]++;
      });

      const peakHour = hourlyPattern.indexOf(Math.max(...hourlyPattern));
      const nightPlayCount = hourlyPattern.slice(22).reduce((a, b) => a + b, 0) + 
                             hourlyPattern.slice(0, 6).reduce((a, b) => a + b, 0);
      const nightPlayRatio = (nightPlayCount / bets.length) * 100;

      // 베팅 패턴 통계
      const betAmounts = bets.map(b => b.bet_amount || 0);
      const avgBet = betAmounts.reduce((a, b) => a + b, 0) / bets.length;
      const maxBet = Math.max(...betAmounts);

      const totalBet = bets.reduce((sum, b) => sum + (b.bet_amount || 0), 0);
      const totalWin = bets.reduce((sum, b) => sum + (b.win_amount || 0), 0);
      const netProfit = totalWin - totalBet;
      
      const winCount = bets.filter(b => (b.win_amount || 0) > (b.bet_amount || 0)).length;
      const winRate = (winCount / bets.length) * 100;

      // 리스크 레벨 계산
      let riskScore = 0;
      if (avgBet > 100000) riskScore += 3;
      else if (avgBet > 50000) riskScore += 2;
      else if (avgBet > 10000) riskScore += 1;

      if (maxBet > 500000) riskScore += 3;
      else if (maxBet > 200000) riskScore += 2;
      else if (maxBet > 50000) riskScore += 1;

      if (netProfit < -1000000) riskScore += 3;
      else if (netProfit < -500000) riskScore += 2;
      else if (netProfit < -100000) riskScore += 1;

      if (bets.length > 500) riskScore += 1;

      const riskLevel = riskScore >= 6 ? 'HIGH' : riskScore >= 3 ? 'MEDIUM' : 'LOW';

      // AI 인사이트 생성
      const insights: string[] = [];

      if (topGames.length > 0) {
        const top = topGames[0];
        const concentration = (top.count / bets.length * 100).toFixed(1);
        insights.push(`💎 가장 선호하는 게임은 "${top.game}"로, 전체 플레이의 ${concentration}%를 차지합니다.`);
        
        if (top.winRate > 60) {
          insights.push(`✅ "${top.game}"에서 ${top.winRate.toFixed(1)}%의 높은 승률을 기록 중입니다.`);
        } else if (top.winRate < 40) {
          insights.push(`⚠️ "${top.game}"에서 ${top.winRate.toFixed(1)}%의 낮은 승률로, 전략 개선이 필요합니다.`);
        }
      }

      insights.push(`🕐 주로 ${peakHour}시에 가장 활발한 활동을 보입니다.`);
      
      if (nightPlayRatio > 40) {
        insights.push(`🌙 야간 시간대(22시~6시) 플레이 비율이 ${nightPlayRatio.toFixed(1)}%로 높습니다.`);
      }

      if (winRate > 55) {
        insights.push(`📈 전체 승률 ${winRate.toFixed(1)}%로 평균 이상의 우수한 성과를 보입니다.`);
      } else if (winRate < 45) {
        insights.push(`📉 전체 승률 ${winRate.toFixed(1)}%로 게임 전략 재검토가 필요합니다.`);
      } else {
        insights.push(`📊 전체 승률 ${winRate.toFixed(1)}%로 평균적인 수준입니다.`);
      }

      if (netProfit > 0) {
        insights.push(`💰 총 ${Math.abs(netProfit).toLocaleString()}원의 수익을 달성했습니다.`);
      } else {
        insights.push(`💸 총 ${Math.abs(netProfit).toLocaleString()}원의 손실이 발생했습니다.`);
      }

      if (avgBet > 50000) {
        insights.push(`⚡ 평균 베팅액이 ${avgBet.toLocaleString()}원으로 고액 베팅 성향입니다.`);
      }

      const betVariance = maxBet / avgBet;
      if (betVariance > 10) {
        insights.push(`📊 베팅 금액 변동성이 높아 일관된 베팅 전략이 필요합니다.`);
      }

      // 사용자 성향 판단
      let userType = '';
      if (riskLevel === 'HIGH') {
        userType = '공격적 고위험 플레이어';
      } else if (riskLevel === 'MEDIUM') {
        if (winRate > 50) {
          userType = '적극적 안정형 플레이어';
        } else {
          userType = '도전적 중위험 플레이어';
        }
      } else {
        if (avgBet < 10000) {
          userType = '보수적 저위험 플레이어';
        } else {
          userType = '신중한 안정형 플레이어';
        }
      }

      setAiAnalysis({
        topGames,
        peakHour,
        nightPlayRatio,
        avgBet,
        maxBet,
        totalBets: bets.length,
        winRate,
        netProfit,
        riskLevel,
        userType,
        insights
      });

    } catch (error) {
      console.error('패턴 분석 오류:', error);
      toast.error('패턴 분석에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 에볼루션 설정 조회
  const fetchEvolutionLimit = async () => {
    try {
      setEvolutionLoading(true);
      
      // ✅ API 설정 조회 - api_configs 테이블에서 조회 (배열로 받아서 invest 찾기)
      const { data: apiConfig, error: configError } = await supabase
        .from('api_configs')
        .select('opcode, secret_key')
        .eq('partner_id', user.referrer_id)
        .eq('api_provider', 'invest')
        .maybeSingle();

      if (configError) {
        console.error('❌ [사용자상세] API config 조회 에러:', configError);
        toast.error('파트너 API 설정 조회 중 오류가 발생했습니다.');
        return;
      }

      if (!apiConfig?.opcode || !apiConfig?.secret_key) {
        console.warn('⚠️ [사용자상세] API config 없음. referrer_id:', user.referrer_id);
        toast.error(`파트너 API 설정을 찾을 수 없습니다. (Partner ID: ${user.referrer_id})`);
        return;
      }

      const signature = md5Hash(apiConfig.opcode + apiConfig.secret_key);

      const response = await fetch('https://vi8282.com/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://api.invest-ho.com/api/game/limit',
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: {
            opcode: apiConfig.opcode,
            signature: signature
          }
        })
      });

      const result = await response.json();
      const data = result.DATA || result;
      const limit = data.limit || 100000000;
      
      setCurrentEvolutionLimit(limit);
      setEvolutionLimit(limit);

    } catch (error: any) {
      console.error('에볼루션 설정 조회 오류:', error);
      toast.error('설정을 불러오는데 실패했습니다.');
    } finally {
      setEvolutionLoading(false);
    }
  };

  // 에볼루션 설정 저장
  const saveEvolutionLimit = async () => {
    try {
      setEvolutionLoading(true);
      
      // ✅ API 설정 조회 - api_configs 테이블에서 조회 (배열로 받아서 invest 찾기)
      const { data: apiConfig, error: configError } = await supabase
        .from('api_configs')
        .select('opcode, secret_key')
        .eq('partner_id', user.referrer_id)
        .eq('api_provider', 'invest')
        .maybeSingle();

      if (configError) {
        console.error('❌ [사용자상세] API config 조회 에러:', configError);
        toast.error('파트너 API 설정 조회 중 오류가 발생했습니다.');
        return;
      }

      if (!apiConfig?.opcode || !apiConfig?.secret_key) {
        console.warn('⚠️ [사용자상세] API config 없음. referrer_id:', user.referrer_id);
        toast.error(`파트너 API 설정을 찾을 수 없습니다. (Partner ID: ${user.referrer_id})`);
        return;
      }

      const signature = md5Hash(apiConfig.opcode + apiConfig.secret_key);

      const response = await fetch('https://vi8282.com/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://api.invest-ho.com/api/game/limit',
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: {
            opcode: apiConfig.opcode,
            users: [user.username],
            limit: evolutionLimit,
            signature: signature
          }
        })
      });

      const result = await response.json();

      if (result.RESULT === true || result.result === true) {
        toast.success('설정이 저장되었습니다.');
        setCurrentEvolutionLimit(evolutionLimit);
      } else {
        toast.error('설정 저장에 실패했습니다.');
      }

    } catch (error: any) {
      console.error('에볼루션 설정 저장 오류:', error);
      toast.error('설정을 저장하는데 실패했습니다.');
    } finally {
      setEvolutionLoading(false);
    }
  };



  // 탭 변경 시 데이터 로드
  useEffect(() => {
    if (!isOpen || !user) return;

    if (activeTab === "basic") {
      calculateStats();
      // 커미션 데이터 초기화
      setCommissionData({
        casino_rolling_commission: user.casino_rolling_commission || 0,
        casino_losing_commission: user.casino_losing_commission || 0,
        slot_rolling_commission: user.slot_rolling_commission || 0,
        slot_losing_commission: user.slot_losing_commission || 0
      });
      setEditMode(false);
      // 메모 데이터 초기화
      setMemoText(user.memo || '');
      setMemoEditMode(false);
      fetchMemoHistory();
    } else if (activeTab === "transactions") {
      fetchTransactions();
    } else if (activeTab === "betting") {
      fetchBettingHistory();
    } else if (activeTab === "pattern") {
      analyzePattern();
    } else if (activeTab === "evolution") {
      fetchEvolutionLimit();
    }
  }, [activeTab, isOpen, user]);

  // invest API 사용 여부 확인
  useEffect(() => {
    const checkInvestApi = async () => {
      if (!isOpen || !user?.referrer_id) {
        setHasInvestApi(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('api_configs')
          .select('opcode')
          .eq('partner_id', user.referrer_id)
          .eq('api_provider', 'invest')
          .maybeSingle();

        if (error) {
          console.error('invest API 확인 에러:', error);
          setHasInvestApi(false);
          return;
        }

        // opcode가 존재하는지 확인
        const hasInvest = !!data?.opcode;
        setHasInvestApi(hasInvest);
      } catch (error) {
        console.error('invest API 확인 에러:', error);
        setHasInvestApi(false);
      }
    };

    checkInvestApi();
  }, [isOpen, user]);

  const formatCurrency = (amount: number) => `₩${amount.toLocaleString()}`;
  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };
  const formatDateTime = (date: string) => {
    const d = new Date(date);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-base px-3 py-1">승인</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-base px-3 py-1">대기</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-base px-3 py-1">거절</Badge>;
      default:
        return <Badge className="text-base px-3 py-1">{status}</Badge>;
    }
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!max-w-[1440px] w-[80vw] max-h-[85vh] overflow-hidden glass-card border border-white/10 p-0">
        <DialogHeader className="border-b border-white/10 pb-4 pt-5 px-8">
          <DialogTitle className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <User className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{user.nickname}</span>
                <span className="text-muted-foreground text-xl">({user.username})</span>
                {user.status === 'active' ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-lg px-3 py-1">활성</Badge>
                ) : user.status === 'suspended' ? (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-lg px-3 py-1">정지</Badge>
                ) : (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-lg px-3 py-1">대기</Badge>
                )}
                {user.is_online && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-lg px-3 py-1">접속중</Badge>
                )}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="text-lg text-muted-foreground mt-1 pl-16">
            회원의 상세 정보, 입출금 내역, 베팅 내역 및 AI 게임 패턴 분석을 확인할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full px-8">
          <div className="bg-slate-800/30 rounded-xl p-2 border border-slate-700/40">
            <TabsList className={`bg-transparent h-auto p-0 border-0 gap-3 w-full grid ${hasInvestApi ? 'grid-cols-5' : 'grid-cols-4'}`}>
              <TabsTrigger 
                value="basic" 
                className="bg-transparent text-slate-400 rounded-lg px-4 py-3 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500/20 data-[state=active]:to-cyan-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20 data-[state=active]:border data-[state=active]:border-blue-400/30 transition-all duration-200"
              >
                <User className="h-6 w-6 mr-2" />
                <span className="text-lg">기본정보</span>
              </TabsTrigger>
              <TabsTrigger 
                value="transactions" 
                className="bg-transparent text-slate-400 rounded-lg px-4 py-3 data-[state=active]:bg-gradient-to-br data-[state=active]:from-green-500/20 data-[state=active]:to-emerald-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-green-500/20 data-[state=active]:border data-[state=active]:border-green-400/30 transition-all duration-200"
              >
                <Wallet className="h-6 w-6 mr-2" />
                <span className="text-lg">입출금내역</span>
              </TabsTrigger>
              <TabsTrigger 
                value="betting" 
                className="bg-transparent text-slate-400 rounded-lg px-4 py-3 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500/20 data-[state=active]:to-pink-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 data-[state=active]:border data-[state=active]:border-purple-400/30 transition-all duration-200"
              >
                <Gamepad2 className="h-6 w-6 mr-2" />
                <span className="text-lg">베팅내역</span>
              </TabsTrigger>
              <TabsTrigger 
                value="pattern" 
                className="bg-transparent text-slate-400 rounded-lg px-4 py-3 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500/20 data-[state=active]:to-amber-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-orange-500/20 data-[state=active]:border data-[state=active]:border-orange-400/30 transition-all duration-200"
              >
                <Brain className="h-6 w-6 mr-2" />
                <span className="text-lg">AI 게임패턴</span>
              </TabsTrigger>
              {hasInvestApi && (
                <TabsTrigger 
                  value="evolution" 
                  className="bg-transparent text-slate-400 rounded-lg px-4 py-3 data-[state=active]:bg-gradient-to-br data-[state=active]:from-red-500/20 data-[state=active]:to-rose-500/10 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-red-500/20 data-[state=active]:border data-[state=active]:border-red-400/30 transition-all duration-200"
                >
                  <Settings className="h-6 w-6 mr-2" />
                  <span className="text-lg">에볼루션 설정</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* 기본정보 탭 */}
          <TabsContent value="basic" className="max-h-[calc(85vh-180px)] overflow-y-auto pr-2 pt-3">
            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="space-y-5 p-4 pb-8">
                {/* 기본 정보 */}
                <div>
                  <h3 className="flex items-center gap-2 mb-4">
                    <User className="h-5 w-5 text-blue-400" />
                    <span className="text-lg">기본 정보</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">아이디</span>
                      <span className="text-lg font-mono">{user.username}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">닉네임</span>
                      <span className="text-lg">{user.nickname}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">가입일</span>
                      <span className="text-lg">{formatDate(user.created_at)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">가입 경과</span>
                      <span className="text-lg">{stats.accountAge}일</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">은행</span>
                      <span className="text-lg">{user.bank_name || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">계좌번호</span>
                      <span className="text-lg font-mono">{user.bank_account || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* 잔고 정보 */}
                <div>
                  <h3 className="flex items-center gap-2 mb-4">
                    <Wallet className="h-5 w-5 text-emerald-400" />
                    <span className="text-lg">잔고 정보</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">보유금</span>
                      <span className="text-xl font-mono">{formatCurrency(user.balance || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">포인트</span>
                      <span className="text-xl font-mono">{formatCurrency(user.points || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">총 입금</span>
                      <span className="text-xl font-mono text-blue-400">{formatCurrency(stats.totalDeposit)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">총 출금</span>
                      <span className="text-xl font-mono text-pink-400">{formatCurrency(stats.totalWithdraw)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-gradient-to-r from-white/10 to-white/5 border border-white/20">
                      <span className="text-lg">순 입출금</span>
                      <span className={`text-xl font-mono ${stats.totalDeposit - stats.totalWithdraw >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(stats.totalDeposit - stats.totalWithdraw)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-gradient-to-r from-white/10 to-white/5 border border-white/20">
                      <span className="text-lg">게임 손익</span>
                      <span className={`text-xl font-mono ${stats.totalWinAmount - stats.totalBets >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stats.totalWinAmount - stats.totalBets >= 0 ? '+' : ''}
                        {formatCurrency(stats.totalWinAmount - stats.totalBets)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 베팅 통계 */}
                <div>
                  <h3 className="flex items-center gap-2 mb-4">
                    <Activity className="h-5 w-5 text-amber-400" />
                    <span className="text-lg">베팅 통계</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">게임 플레이</span>
                      <span className="text-lg font-mono">{stats.gameCount}회</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">승률</span>
                      <span className={`text-lg font-mono ${stats.winRate > 50 ? 'text-green-400' : 'text-red-400'}`}>
                        {stats.winRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">총 베팅액</span>
                      <span className="text-lg font-mono">{formatCurrency(stats.totalBets)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">총 당첨액</span>
                      <span className="text-lg font-mono">{formatCurrency(stats.totalWinAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* 활동 정보 */}
                <div>
                  <h3 className="flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5 text-purple-400" />
                    <span className="text-lg">활동 정보</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">최근 활동</span>
                      <span className="text-lg">{formatDateTime(stats.lastActivity)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                      <span className="text-base text-muted-foreground">추천인</span>
                      <span className="text-lg">{user.referrer?.username || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* 관리자 메모 섹션 */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-400" />
                      <span className="text-lg">관리자 메모</span>
                    </h3>
                    <div className="flex gap-2">
                      {memoHistory.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowMemoHistory(!showMemoHistory)}
                          className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 text-sm"
                        >
                          📜 이력 ({memoHistory.length})
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (memoEditMode) {
                            setMemoText(user.memo || '');
                          }
                          setMemoEditMode(!memoEditMode);
                        }}
                        className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 text-sm"
                      >
                        {memoEditMode ? '취소' : '✏️ 수정'}
                      </Button>
                    </div>
                  </div>
                  
                  {memoEditMode ? (
                    <div className="space-y-3">
                      <textarea
                        value={memoText}
                        onChange={(e) => setMemoText(e.target.value)}
                        className="w-full min-h-[120px] p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-white text-base focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 resize-none"
                        placeholder="관리자 메모를 입력하세요..."
                      />
                      <Button
                        onClick={saveMemo}
                        disabled={loading}
                        className="w-full btn-premium-primary text-base h-11"
                      >
                        {loading ? '저장 중...' : '💾 메모 저장'}
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-white/5 border border-white/10 min-h-[80px]">
                      <p className="text-lg text-white/90 whitespace-pre-wrap">
                        {user.memo || '메모가 없습니다.'}
                      </p>
                    </div>
                  )}

                  {/* 메모 이력 */}
                  {showMemoHistory && memoHistory.length > 0 && (
                    <div className="mt-4 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <h4 className="text-base text-amber-400 mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        메모 변경 이력
                      </h4>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {memoHistory.map((history, idx) => (
                          <div key={history.id} className="p-3 rounded bg-white/5 border border-white/10">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-amber-400">
                                #{memoHistory.length - idx}
                              </span>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <span>{history.created_by_nickname || history.created_by_username || '관리자'}</span>
                                <span>{formatDateTime(history.created_at)}</span>
                              </div>
                            </div>
                            <p className="text-base text-white/80 whitespace-pre-wrap">
                              {history.memo || '(삭제됨)'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 비밀번호 변경 섹션 */}
                <PasswordChangeSection userId={user.id} />

                {/* 출금/포인트전환 비밀번호 변경 섹션 */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="flex items-center gap-2">
                      <Settings className="h-5 w-5 text-cyan-400" />
                      <span className="text-lg">2차 비밀번호 관리</span>
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (withdrawalPasswordEditMode) {
                          setWithdrawalPassword('');
                          setPointConversionPassword('');
                        }
                        setWithdrawalPasswordEditMode(!withdrawalPasswordEditMode);
                      }}
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 text-sm"
                    >
                      {withdrawalPasswordEditMode ? '취소' : '✏️ 수정'}
                    </Button>
                  </div>

                  {withdrawalPasswordEditMode ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-base text-muted-foreground">🔐 출금 비밀번호 (4자리)</Label>
                          <Input
                            type="password"
                            value={withdrawalPassword}
                            onChange={(e) => setWithdrawalPassword(e.target.value)}
                            placeholder="새 출금 비밀번호 입력"
                            maxLength={4}
                            className="h-11 text-base bg-slate-800/50 border-slate-700 focus:border-cyan-500/60"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-base text-muted-foreground">💰 포인트전환 비밀번호 (4자리)</Label>
                          <Input
                            type="password"
                            value={pointConversionPassword}
                            onChange={(e) => setPointConversionPassword(e.target.value)}
                            placeholder="새 포인트전환 비밀번호 입력"
                            maxLength={4}
                            className="h-11 text-base bg-slate-800/50 border-slate-700 focus:border-cyan-500/60"
                          />
                        </div>
                      </div>
                      <Button
                        onClick={savePasswords}
                        disabled={passwordLoading || (!withdrawalPassword && !pointConversionPassword)}
                        className="w-full btn-premium-primary text-base h-11"
                      >
                        {passwordLoading ? '저장 중...' : '💾 비밀번호 저장'}
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                        <span className="text-base text-muted-foreground">출금 비밀번호</span>
                        <span className="text-lg font-mono">
                          {user.withdrawal_password ? '••••' : '미설정'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-white/5 border border-white/10">
                        <span className="text-base text-muted-foreground">포인트전환 비밀번호</span>
                        <span className="text-lg font-mono">
                          {user.point_conversion_password ? '••••' : '미설정'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 커미션 설정 섹션 */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-purple-400" />
                      <span className="text-base">커미션 설정 (%)</span>
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (editMode) {
                          // 취소 시 원래 값 복원
                          setCommissionData({
                            casino_rolling_commission: user.casino_rolling_commission || 0,
                            casino_losing_commission: user.casino_losing_commission || 0,
                            slot_rolling_commission: user.slot_rolling_commission || 0,
                            slot_losing_commission: user.slot_losing_commission || 0
                          });
                        }
                        setEditMode(!editMode);
                      }}
                      className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                    >
                      {editMode ? '취소' : '✏️ 수정'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {/* 카지노 롤링 */}
                    <div className="space-y-2">
                      <Label className="text-base text-muted-foreground">🎰 카지노 롤링</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={commissionData.casino_rolling_commission}
                        onChange={(e) => setCommissionData(prev => ({
                          ...prev,
                          casino_rolling_commission: parseFloat(e.target.value) || 0
                        }))}
                        onFocus={(e) => e.target.select()}
                        className={`input-premium text-lg h-12 ${!editMode ? 'opacity-60 cursor-not-allowed' : 'focus:border-purple-500/60'}`}
                        disabled={!editMode}
                        placeholder="0.00"
                      />
                    </div>
                    {/* 카지노 루징 */}
                    <div className="space-y-2">
                      <Label className="text-base text-muted-foreground">🎰 카지노 루징</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={commissionData.casino_losing_commission}
                        onChange={(e) => setCommissionData(prev => ({
                          ...prev,
                          casino_losing_commission: parseFloat(e.target.value) || 0
                        }))}
                        onFocus={(e) => e.target.select()}
                        className={`input-premium text-lg h-12 ${!editMode ? 'opacity-60 cursor-not-allowed' : 'focus:border-purple-500/60'}`}
                        disabled={!editMode}
                        placeholder="0.00"
                      />
                    </div>
                    {/* 슬롯 롤링 */}
                    <div className="space-y-2">
                      <Label className="text-base text-muted-foreground">🎮 슬롯 롤링</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={commissionData.slot_rolling_commission}
                        onChange={(e) => setCommissionData(prev => ({
                          ...prev,
                          slot_rolling_commission: parseFloat(e.target.value) || 0
                        }))}
                        onFocus={(e) => e.target.select()}
                        className={`input-premium text-lg h-12 ${!editMode ? 'opacity-60 cursor-not-allowed' : 'focus:border-pink-500/60'}`}
                        disabled={!editMode}
                        placeholder="0.00"
                      />
                    </div>
                    {/* 슬롯 루징 */}
                    <div className="space-y-2">
                      <Label className="text-base text-muted-foreground">🎮 슬롯 루징</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={commissionData.slot_losing_commission}
                        onChange={(e) => setCommissionData(prev => ({
                          ...prev,
                          slot_losing_commission: parseFloat(e.target.value) || 0
                        }))}
                        onFocus={(e) => e.target.select()}
                        className={`input-premium text-lg h-12 ${!editMode ? 'opacity-60 cursor-not-allowed' : 'focus:border-pink-500/60'}`}
                        disabled={!editMode}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  {editMode && (
                    <div className="flex gap-3 pt-4">
                      <Button
                        onClick={saveCommission}
                        disabled={loading}
                        className="w-full btn-premium-primary text-base h-11"
                      >
                        {loading ? '저장 중...' : '💾 커미션 저장'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* 입출금내역 탭 */}
          <TabsContent value="transactions" className="max-h-[calc(85vh-140px)] overflow-y-auto pr-2 pt-3">
            {loading ? (
              <LoadingSpinner />
            ) : transactions.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-xl">
                <Wallet className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground text-lg">입출금 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-white/10">
                      <tr className="bg-white/5">
                        <th className="px-4 py-4 text-left text-base">구분</th>
                        <th className="px-4 py-4 text-left text-base">상태</th>
                        <th className="px-4 py-4 text-left text-base">일시</th>
                        <th className="px-4 py-4 text-left text-base">메모</th>
                        <th className="px-4 py-4 text-right text-base">금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className={`p-2 rounded-lg ${
                                tx.transaction_type === 'deposit' 
                                  ? 'bg-green-500/20' 
                                  : 'bg-red-500/20'
                              }`}>
                                {tx.transaction_type === 'deposit' ? (
                                  <TrendingUp className="h-5 w-5 text-green-400" />
                                ) : (
                                  <ArrowDownToLine className="h-5 w-5 text-red-400" />
                                )}
                              </div>
                              <span className="text-base">
                                {tx.transaction_type === 'deposit' ? '입금' : '출금'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            {getStatusBadge(tx.status)}
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground text-base">
                            {formatDateTime(tx.created_at)}
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground text-base max-w-xs truncate">
                            {tx.notes || '-'}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className={`font-mono text-lg ${
                              tx.transaction_type === 'deposit' ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {tx.transaction_type === 'deposit' ? '+' : '-'}
                              {formatCurrency(tx.amount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* 베팅내역 탭 */}
          <TabsContent value="betting" className="max-h-[calc(85vh-140px)] overflow-y-auto pr-2 pt-3">
            {loading ? (
              <LoadingSpinner />
            ) : bettingHistory.length === 0 ? (
              <div className="text-center py-12 glass-card rounded-xl">
                <Gamepad2 className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground text-base">베팅 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-white/10">
                      <tr className="bg-white/5">
                        <th className="px-5 py-4.5 text-left text-base font-semibold">게임</th>
                        <th className="px-5 py-4.5 text-left text-base font-semibold">프로바이더</th>
                        <th className="px-5 py-4.5 text-left text-base font-semibold">일시</th>
                        <th className="px-5 py-4.5 text-right text-base font-semibold">베팅</th>
                        <th className="px-5 py-4.5 text-right text-base font-semibold">당첨</th>
                        <th className="px-5 py-4.5 text-right text-base font-semibold">손익</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bettingHistory.map((bet) => {
                        const isWin = (bet.win_amount || 0) > (bet.bet_amount || 0);
                        const profit = (bet.win_amount || 0) - (bet.bet_amount || 0);
                        
                        return (
                          <tr key={bet.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <div className={`p-2 rounded-lg ${
                                  isWin ? 'bg-green-500/20' : 'bg-red-500/20'
                                }`}>
                                  <Gamepad2 className={`h-5 w-5 ${
                                    isWin ? 'text-green-400' : 'text-red-400'
                                  }`} />
                                </div>
                                <span className="text-base font-medium">
                                  {bet.game_title || `게임 ID: ${bet.game_id}`}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-muted-foreground text-base">
                              {bet.provider_name || `프로바이더 ${bet.provider_id}`}
                            </td>
                            <td className="px-5 py-4 text-muted-foreground text-base">
                              {formatDateTime(bet.played_at)}
                            </td>
                            <td className="px-5 py-4 text-right font-mono text-base font-medium">
                              {formatCurrency(bet.bet_amount || 0)}
                            </td>
                            <td className="px-5 py-4 text-right font-mono text-base font-medium">
                              {formatCurrency(bet.win_amount || 0)}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <span className={`font-mono text-lg font-semibold ${
                                isWin ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* AI 게임패턴 탭 */}
          <TabsContent value="pattern" className="space-y-3 max-h-[calc(85vh-140px)] overflow-y-auto pr-2 pt-3">
            {loading ? (
              <LoadingSpinner />
            ) : !aiAnalysis ? (
              <div className="text-center py-12 glass-card rounded-xl">
                <Brain className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground text-lg mb-2">분석할 베팅 데이터가 부족합니다.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {/* 사용자 성향 & 리스크 & 베팅 통계 & 시간 패턴 */}
                <div className="grid gap-4 grid-cols-4">
                  <Card className="glass-card metric-gradient-purple">
                    <CardContent className="pt-4 pb-4 px-5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Target className="h-5 w-5 text-white" />
                        <h3 className="text-base text-white">사용자 성향</h3>
                      </div>
                      <p className="text-lg font-bold text-white mb-1.5">{aiAnalysis.userType}</p>
                      <p className="text-base text-white/80">베팅 패턴 종합 분석</p>
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardContent className="pt-4 pb-4 px-5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <AlertTriangle className="h-5 w-5 text-yellow-400" />
                        <h3 className="text-base">리스크 분석</h3>
                      </div>
                      <Badge className={`px-3 py-1.5 mb-2 text-base ${
                        aiAnalysis.riskLevel === 'HIGH' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                        aiAnalysis.riskLevel === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                        'bg-green-500/20 text-green-400 border-green-500/30'
                      }`}>
                        {aiAnalysis.riskLevel === 'HIGH' ? '고위험' :
                         aiAnalysis.riskLevel === 'MEDIUM' ? '중위험' : '저위험'}
                      </Badge>
                      <div className="text-base text-muted-foreground">
                        평균: <span className="font-mono text-lg">{formatCurrency(aiAnalysis.avgBet)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardContent className="pt-4 pb-4 px-5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <BarChart3 className="h-5 w-5 text-cyan-400" />
                        <h3 className="text-base">베팅 통계</h3>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-base text-muted-foreground">총 베팅</span>
                          <span className="text-lg font-mono">{aiAnalysis.totalBets}회</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-base text-muted-foreground">승률</span>
                          <span className={`text-lg font-mono ${aiAnalysis.winRate > 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {aiAnalysis.winRate.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardContent className="pt-4 pb-4 px-5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <Clock className="h-5 w-5 text-orange-400" />
                        <h3 className="text-base">시간 패턴</h3>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-base text-muted-foreground">피크</span>
                          <span className="text-lg font-mono">{aiAnalysis.peakHour}시</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-base text-muted-foreground">야간</span>
                          <span className="text-lg font-mono">{aiAnalysis.nightPlayRatio.toFixed(1)}%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 선호 게임 TOP 5 */}
                <Card className="glass-card">
                  <CardContent className="pt-4 pb-4 px-5">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
                      <Trophy className="h-5 w-5 text-yellow-400" />
                      <h3 className="text-base">선호 게임 TOP 5</h3>
                    </div>
                    <div className="grid grid-cols-5 gap-3">
                      {aiAnalysis.topGames.map((game: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-2.5 py-1 mb-2 text-base">
                            {idx + 1}위
                          </Badge>
                          <p className="text-base mb-1 truncate">{game.game}</p>
                          <p className="text-base text-muted-foreground mb-2 truncate">{game.provider}</p>
                          <div className="space-y-1">
                            <p className="font-mono text-base">{game.count}회</p>
                            <p className={`text-base ${game.winRate > 50 ? 'text-green-400' : 'text-red-400'}`}>
                              승률 {game.winRate.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* AI 인사이트 */}
                <Card className="glass-card">
                  <CardContent className="pt-4 pb-4 px-5">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
                      <Brain className="h-5 w-5 text-purple-400" />
                      <h3 className="text-base">AI 분석 인사이트</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {aiAnalysis.insights.map((insight: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/15 transition-colors">
                          <Brain className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                          <p className="text-base leading-relaxed">{insight}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* 에볼루션 설정 탭 */}
          <TabsContent value="evolution" className="max-h-[calc(85vh-140px)] overflow-y-auto pr-2 pt-3">
            {evolutionLoading ? (
              <LoadingSpinner />
            ) : (
              <div className="space-y-4 p-4">
                <Card className="glass-card">
                  <CardContent className="pt-6 pb-6 px-6">
                    <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/10">
                      <Settings className="h-5 w-5 text-red-400" />
                      <h3 className="text-base">에볼루션 최대배팅금 설정</h3>
                    </div>

                    <div className="space-y-5">
                      {/* 현재 설정 값 */}
                      {currentEvolutionLimit !== null && (
                        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                          <div className="flex items-center justify-between">
                            <span className="text-base text-slate-400">현재 설정</span>
                            <span className="font-mono text-xl text-blue-400">
                              {currentEvolutionLimit.toLocaleString()}원
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 회원 정보 */}
                      <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700">
                        <div className="text-base text-slate-400 mb-2">회원 아이디</div>
                        <div className="font-mono text-lg text-white">{user.username}</div>
                      </div>

                      {/* 최대배팅금 설정 */}
                      <div>
                        <Label className="text-base text-slate-400 mb-2">최대배팅금액</Label>
                        <Input
                          type="number"
                          value={evolutionLimit}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            setEvolutionLimit(value);
                          }}
                          className="bg-slate-800/50 border-slate-700 text-white font-mono text-lg h-12"
                          placeholder="금액 입력"
                        />
                        <p className="text-base text-slate-500 mt-2">
                          {evolutionLimit.toLocaleString()}원
                        </p>
                      </div>

                      {/* 금액 단축 버튼 */}
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { value: 100000, label: '1십만' },
                          { value: 500000, label: '5십만' },
                          { value: 1000000, label: '1백만' },
                          { value: 5000000, label: '5백만' },
                          { value: 10000000, label: '1천만' },
                          { value: 50000000, label: '5천만' },
                          { value: 100000000, label: '10천만' }
                        ].map((item) => (
                          <Button
                            key={item.value}
                            variant="outline"
                            size="sm"
                            onClick={() => setEvolutionLimit(prev => prev + item.value)}
                            className="bg-slate-800/50 border-slate-700 hover:bg-slate-700 text-sm font-mono"
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>

                      {/* 저장 버튼 */}
                      <div className="flex gap-3 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => setEvolutionLimit(currentEvolutionLimit || 100000000)}
                          className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-700/50 text-sm"
                        >
                          초기화
                        </Button>
                        <Button
                          onClick={saveEvolutionLimit}
                          disabled={evolutionLoading}
                          className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-sm"
                        >
                          {evolutionLoading ? '저장 중...' : '저장'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}