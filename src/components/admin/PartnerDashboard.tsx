import { useState, useEffect } from "react";
import { Play, Settings, BarChart3, Users, TrendingUp, DollarSign, Activity, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle, AdminDialogFooter as DialogFooter } from "./AdminDialog";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";

interface PartnerDashboardProps {
  user: any;
}

interface PartnerStats {
  totalPartners: number;
  activePartners: number;
  newPartners: number;
  avgSettlementRate: number;
}

interface RealtimeSettlementData {
  dailyDeposit: number;
  dailyWithdrawal: number;
  dailyRolling: number;
}

export function PartnerDashboard({ user }: PartnerDashboardProps) {
  // 데이터 상태
  const [partnerStats, setPartnerStats] = useState<PartnerStats>({
    totalPartners: 0,
    activePartners: 0,
    newPartners: 0,
    avgSettlementRate: 0
  });

  const [settlementData, setSettlementData] = useState<RealtimeSettlementData>({
    dailyDeposit: 0,
    dailyWithdrawal: 0,
    dailyRolling: 0
  });

  const [loading, setLoading] = useState(true);

  // 공베팅 설정 상태
  const [showGongBetModal, setShowGongBetModal] = useState(false);
  const [gongBetEnabled, setGongBetEnabled] = useState(false);
  const [gongBetLevels, setGongBetLevels] = useState<{ [key: number]: boolean }>({
    3: false, 4: false, 5: false, 6: false, 7: false
  });
  const [gongBetRate, setGongBetRate] = useState<number | ''>('');

  // 개별 공베팅 토글 상태
  const [casinoGongBetEnabled, setCasinoGongBetEnabled] = useState(false);
  const [slotGongBetEnabled, setSlotGongBetEnabled] = useState(false);
  const [cutRollingEnabled, setCutRollingEnabled] = useState(false);

  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });

  // 공베팅 설정 로드
  const loadGongBetSettings = async () => {
    try {
      console.log('🔍 파트너 공베팅 보드 - 공베팅 설정 로드 시작 - 사용자 ID:', user.id);

      const { data: settings, error } = await supabase
        .from('user_settings')
        .select('gong_bet_settings')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ 파트너 공베팅 보드 - 공베팅 설정 조회 실패:', error);
        return;
      }

      if (settings?.gong_bet_settings) {
        const gongSettings = settings.gong_bet_settings;
        console.log('✅ 파트너 공베팅 보드 - 공베팅 설정 로드됨:', gongSettings);

        setGongBetEnabled(gongSettings.gongBetEnabled === true);
        setGongBetLevels(gongSettings.gongBetLevels || { 3: false, 4: false, 5: false, 6: false, 7: false });
        setGongBetRate(typeof gongSettings.gongBetRate === 'number' ? gongSettings.gongBetRate : '');
        setCasinoGongBetEnabled(gongSettings.casinoGongBetEnabled === true);
        setSlotGongBetEnabled(gongSettings.slotGongBetEnabled === true);
        setCutRollingEnabled(gongSettings.cutRollingEnabled === true);

        console.log('✅ 파트너 공베팅 보드 - 공베팅 설정 적용 완료');
      } else {
        console.log('ℹ️ 파트너 공베팅 보드 - 공베팅 설정이 없어 기본값 사용');
        setGongBetEnabled(false);
        setGongBetLevels({ 3: false, 4: false, 5: false, 6: false, 7: false });
        setGongBetRate('');
        setCasinoGongBetEnabled(false);
        setSlotGongBetEnabled(false);
        setCutRollingEnabled(false);
      }
    } catch (error) {
      console.error('❌ 파트너 공베팅 보드 - 공베팅 설정 로드 실패:', error);
      setGongBetEnabled(false);
      setGongBetLevels({ 3: false, 4: false, 5: false, 6: false, 7: false });
      setGongBetRate('');
      setCasinoGongBetEnabled(false);
      setSlotGongBetEnabled(false);
      setCutRollingEnabled(false);
    }
  };

  // 공베팅 설정 저장
  const saveGongBetSettings = async (overrideEnabled?: boolean) => {
    try {
      const settingsData = {
        gongBetEnabled: overrideEnabled !== undefined ? overrideEnabled : gongBetEnabled,
        gongBetLevels,
        gongBetRate,
        casinoGongBetEnabled,
        slotGongBetEnabled,
        cutRollingEnabled
      };

      console.log('💾 파트너 대시보드 - 공베팅 설정 저장 시도 - 사용자 ID:', user.id, '- 데이터:', settingsData);

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          gong_bet_settings: settingsData,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('❌ 파트너 대시보드 - 공베팅 설정 저장 실패:', error);
        throw error;
      }

      console.log('✅ 파트너 대시보드 - 공베팅 설정 저장 성공');
      toast.success('공베팅 설정이 저장되었습니다.');
    } catch (error) {
      console.error('❌ 파트너 대시보드 - 공베팅 설정 저장 실패:', error);
      toast.error('설정 저장에 실패했습니다.');
    }
  };

  // 카드 토글 변경 시 모달 상태도 업데이트 및 사용자 안내 + 자동 저장
  const handleCasinoGongBetToggle = async (enabled: boolean) => {
    setCasinoGongBetEnabled(enabled);

    // 전체 공베팅이 활성화된 상태에서 개별 토글 변경 시 자동 저장
    if (gongBetEnabled) {
      try {
        await saveGongBetSettings();
      } catch (error) {
        console.error('자동 저장 실패:', error);
      }
    } else if (enabled && !gongBetEnabled) {
      setGongBetEnabled(true);

      // 전체 활성화가 안되어 있을 때만 안내 메시지 표시
      toast.info(
        '💡 카지노 공베팅이 활성화되었습니다! 상세 설정을 위해 공베팅 설정 버튼을 클릭해주세요.',
        {
          duration: 4000,
          description: '공베팅 요율과 적용 레벨을 설정해야 효과적으로 작동합니다.'
        }
      );

      // gongBetEnabled가 활성화되었으므로 설정 저장
      try {
        await saveGongBetSettings();
      } catch (error) {
        console.error('자동 저장 실패:', error);
      }
    }
  };

  const handleSlotGongBetToggle = async (enabled: boolean) => {
    setSlotGongBetEnabled(enabled);

    // 전체 공베팅이 활성화된 상태에서 개별 토글 변경 시 자동 저장
    if (gongBetEnabled) {
      try {
        await saveGongBetSettings();
      } catch (error) {
        console.error('자동 저장 실패:', error);
      }
    } else if (enabled && !gongBetEnabled) {
      setGongBetEnabled(true);

      // 전체 활성화가 안되어 있을 때만 안내 메시지 표시
      toast.info(
        '💡 슬롯 공베팅이 활성화되었습니다! 상세 설정을 위해 공베팅 설정 버튼을 클릭해주세요.',
        {
          duration: 4000,
          description: '공베팅 요율과 적용 레벨을 설정해야 효과적으로 작동합니다.'
        }
      );

      // gongBetEnabled가 활성화되었으므로 설정 저장
      try {
        await saveGongBetSettings();
      } catch (error) {
        console.error('자동 저장 실패:', error);
      }
    }
  };

  const handleCutRollingToggle = async (enabled: boolean) => {
    setCutRollingEnabled(enabled);

    // 전체 공베팅이 활성화된 상태에서 개별 토글 변경 시 자동 저장
    if (gongBetEnabled) {
      try {
        await saveGongBetSettings();
      } catch (error) {
        console.error('자동 저장 실패:', error);
      }
    } else if (enabled && !gongBetEnabled) {
      setGongBetEnabled(true);

      // 전체 활성화가 안되어 있을 때만 안내 메시지 표시
      toast.info(
        '💡 절삭 롤링금이 활성화되었습니다! 상세 설정을 위해 공베팅 설정 버튼을 클릭해주세요.',
        {
          duration: 4000,
          description: '공베팅 요율과 적용 레벨을 설정해야 효과적으로 작동합니다.'
        }
      );

      // gongBetEnabled가 활성화되었으므로 설정 저장
      try {
        await saveGongBetSettings();
      } catch (error) {
        console.error('자동 저장 실패:', error);
      }
    }
  };

  // 초기 데이터 로딩
  useEffect(() => {
    fetchDashboardData();
    loadGongBetSettings();
  }, []);

  // 모달 열릴 때 위치 초기화
  useEffect(() => {
    if (showGongBetModal) {
      setModalPosition({ x: 0, y: 0 });
    }
  }, [showGongBetModal]);

  // 파트너 통계 조회
  const fetchPartnerStats = async () => {
    try {
      // 하위 파트너들 조회
      const { data: hierarchicalPartners } = await supabase
        .rpc('get_hierarchical_partners', { p_partner_id: user.id });

      if (hierarchicalPartners) {
        const partnerIds = hierarchicalPartners.map((p: any) => p.id);

        // 본인 제외
        const childPartnerIds = partnerIds.filter(id => id !== user.id);

        // 파트너 기본 정보 조회
        const { data: partners, error: partnersError } = await supabase
          .from('partners')
          .select('*')
          .in('id', childPartnerIds);

        if (partnersError) throw partnersError;

        // 활성 파트너 수 계산 (최근 30일 내 로그인)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const activePartners = partners?.filter(partner => {
          const lastLogin = partner.last_login ? new Date(partner.last_login) : null;
          return lastLogin && lastLogin > thirtyDaysAgo;
        }).length || 0;

        // 신규 파트너 수 계산 (최근 7일)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const newPartners = partners?.filter(partner => {
          const createdAt = new Date(partner.created_at);
          return createdAt > sevenDaysAgo;
        }).length || 0;

        // 평균 정산율 계산
        const avgSettlementRate = partners && partners.length > 0
          ? partners.reduce((sum, partner) => {
              const casinoRate = partner.casino_rolling_commission || 0;
              const slotRate = partner.slot_rolling_commission || 0;
              return sum + ((casinoRate + slotRate) / 2);
            }, 0) / partners.length
          : 0;

        setPartnerStats({
          totalPartners: partners?.length || 0,
          activePartners,
          newPartners,
          avgSettlementRate: Math.round(avgSettlementRate * 100) / 100
        });
      }
    } catch (error) {
      console.error('파트너 통계 조회 실패:', error);
      toast.error('파트너 통계를 불러오는데 실패했습니다.');
    }
  };

  // 실시간 정산 데이터 조회
  const fetchRealtimeSettlementData = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

      // 하위 파트너 및 사용자 조회
      const { data: hierarchicalPartners } = await supabase
        .rpc('get_hierarchical_partners', { p_partner_id: user.id });

      if (hierarchicalPartners) {
        const partnerIds = hierarchicalPartners.map((p: any) => p.id);
        const childPartnerIds = partnerIds.filter(id => id !== user.id);

        // 파트너와 사용자 ID 수집
        const targetUserIds = [...childPartnerIds];
        const { data: users } = await supabase
          .from('users')
          .select('id, referrer_id')
          .in('referrer_id', childPartnerIds);

        if (users) {
          targetUserIds.push(...users.map(u => u.id));
        }

        // 금일 입금 조회
        const { data: deposits } = await supabase
          .from('transactions')
          .select('amount')
          .in('user_id', targetUserIds)
          .eq('transaction_type', 'deposit')
          .eq('status', 'completed')
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString());

        // 금일 출금 조회
        const { data: withdrawals } = await supabase
          .from('transactions')
          .select('amount')
          .in('user_id', targetUserIds)
          .eq('transaction_type', 'withdrawal')
          .eq('status', 'completed')
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString());

        // 금일 게임 기록으로 롤링금 계산
        const { data: gameRecords } = await supabase
          .from('game_records')
          .select('*')
          .in('user_id', targetUserIds)
          .gte('played_at', startOfDay.toISOString())
          .lte('played_at', endOfDay.toISOString());

        let dailyRolling = 0;
        if (gameRecords && gameRecords.length > 0) {
          // 사용자별 정산율 정보가 필요하므로 파트너 정보와 조합
          const { data: partners } = await supabase
            .from('partners')
            .select('id, casino_rolling_commission, slot_rolling_commission')
            .in('id', childPartnerIds);

          const partnerMap = new Map(partners?.map(p => [p.id, p]) || []);

          for (const record of gameRecords) {
            // 사용자의 파트너 정보 찾기
            const userPartner = users?.find(u => u.id === record.user_id);
            if (userPartner) {
              const partner = partnerMap.get(userPartner.referrer_id);
              if (partner) {
                const rate = record.game_type === 'casino'
                  ? (partner.casino_rolling_commission || 0)
                  : (partner.slot_rolling_commission || 0);
                dailyRolling += (record.bet_amount || 0) * (rate / 100);
              }
            }
          }
        }

        setSettlementData({
          dailyDeposit: deposits?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0,
          dailyWithdrawal: withdrawals?.reduce((sum, w) => sum + (w.amount || 0), 0) || 0,
          dailyRolling
        });
      }
    } catch (error) {
      console.error('실시간 정산 데이터 조회 실패:', error);
      toast.error('정산 데이터를 불러오는데 실패했습니다.');
    }
  };

  // 전체 대시보드 데이터 조회
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchPartnerStats(),
        fetchRealtimeSettlementData()
      ]);
    } catch (error) {
      console.error('대시보드 데이터 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="space-y-8 p-6">
      {/* 페이지 헤더 */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <BarChart3 className="h-8 w-8 text-blue-400" />
          <h1 className="text-3xl font-bold text-white">파트너 공베팅 보드</h1>
        </div>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          실시간 정산 현황과 공베팅 설정을 관리하세요
        </p>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">

        {/* 왼쪽: 통계 카드들 */}
        <div className="space-y-6">
          {/* 파트너 현황 카드 */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <Users className="h-6 w-6 text-green-400" />
              <h2 className="text-xl font-semibold text-white">파트너 현황</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-green-900/50 to-slate-900 rounded-lg p-4 border border-green-700/30">
                <div className="text-2xl font-bold text-green-400 mb-1">
                  {loading ? '...' : formatNumber(partnerStats.totalPartners)}
                </div>
                <div className="text-sm text-slate-400">총 파트너 수</div>
              </div>

              <div className="bg-gradient-to-br from-blue-900/50 to-slate-900 rounded-lg p-4 border border-blue-700/30">
                <div className="text-2xl font-bold text-blue-400 mb-1">
                  {loading ? '...' : formatNumber(partnerStats.activePartners)}
                </div>
                <div className="text-sm text-slate-400">활성 파트너</div>
              </div>

              <div className="bg-gradient-to-br from-purple-900/50 to-slate-900 rounded-lg p-4 border border-purple-700/30">
                <div className="text-2xl font-bold text-purple-400 mb-1">
                  {loading ? '...' : formatNumber(partnerStats.newPartners)}
                </div>
                <div className="text-sm text-slate-400">신규 파트너</div>
              </div>

              <div className="bg-gradient-to-br from-orange-900/50 to-slate-900 rounded-lg p-4 border border-orange-700/30">
                <div className="text-2xl font-bold text-orange-400 mb-1">
                  {loading ? '...' : `${partnerStats.avgSettlementRate}%`}
                </div>
                <div className="text-sm text-slate-400">평균 정산율</div>
              </div>
            </div>
          </div>

          {/* 실시간 정산 현황 */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="h-6 w-6 text-cyan-400" />
              <h2 className="text-xl font-semibold text-white">실시간 정산 현황</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-green-400" />
                  <span className="text-white font-medium">금일 총 입금</span>
                </div>
                <span className="text-xl font-bold text-green-400">
                  {loading ? '...' : formatNumber(settlementData.dailyDeposit)}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-red-400" />
                  <span className="text-white font-medium">금일 총 출금</span>
                </div>
                <span className="text-xl font-bold text-red-400">
                  {loading ? '...' : formatNumber(settlementData.dailyWithdrawal)}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-blue-400" />
                  <span className="text-white font-medium">금일 총 롤링금</span>
                </div>
                <span className="text-xl font-bold text-blue-400">
                  {loading ? '...' : formatNumber(settlementData.dailyRolling)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 오른쪽: 공베팅 설정 섹션 */}
        <div className="space-y-6">
          {/* 공베팅 설정 카드 */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="h-6 w-6 text-orange-400" />
              <h2 className="text-xl font-semibold text-white">공베팅 설정</h2>
            </div>

            <div className="space-y-6">
              {/* 공베팅 전체 활성화 */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                <div>
                  <div className="text-white font-medium mb-1">공베팅 전체 활성화</div>
                  <div className="text-sm text-slate-400">모든 파트너에 대한 공베팅 기능 제어</div>
                </div>
                <Switch
                  checked={gongBetEnabled}
                  onCheckedChange={async (enabled: boolean) => {
                    setGongBetEnabled(enabled);
                    try {
                      await saveGongBetSettings(enabled);
                    } catch (error) {
                      console.error('자동 저장 실패:', error);
                    }
                  }}
                  size="lg"
                />
              </div>

              {/* 개별 공베팅 토글들 */}
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
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

                <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
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

                <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
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

              {/* 상세 설정 버튼 */}
              <Button
                onClick={() => setShowGongBetModal(true)}
                className="w-full bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white py-3 text-lg font-semibold"
                disabled={!gongBetEnabled}
              >
                <Settings className="h-5 w-5 mr-2" />
                공베팅 상세 설정
              </Button>
            </div>
          </div>


        </div>
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
                <h2 className="text-xl font-semibold text-white">공베팅 상세 설정</h2>
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
              {/* 공베팅 적용 레벨 선택 */}
              <div className="space-y-4">
                <Label className="text-lg font-medium text-white">공베팅 적용 레벨</Label>
                <div className="grid grid-cols-2 gap-4">
                  {[3, 4, 5, 6, 7].map((level) => (
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
                        {level === 3 ? '본사' : level === 4 ? '부본사' : level === 5 ? '총판' : level === 6 ? '매장' : '특별'}
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
                    value={gongBetRate}
                    onChange={async (e) => {
                      const value = e.target.value === '' ? '' : parseFloat(e.target.value) || 0;
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

              {/* 현재 설정 상태 */}
              <div className="p-6 bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-xl border border-blue-700/30">
                <h4 className="text-lg font-medium text-white mb-4">현재 설정 상태</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", gongBetEnabled ? "bg-green-500" : "bg-red-500")}></div>
                    <span className="text-slate-300">전체 활성화</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", casinoGongBetEnabled ? "bg-green-500" : "bg-red-500")}></div>
                    <span className="text-slate-300">카지노 공베팅</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", slotGongBetEnabled ? "bg-green-500" : "bg-red-500")}></div>
                    <span className="text-slate-300">슬롯 공베팅</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", cutRollingEnabled ? "bg-green-500" : "bg-red-500")}></div>
                    <span className="text-slate-300">절삭 롤링금</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">적용 요율:</span>
                    <span className="text-cyan-400 font-semibold">{gongBetRate}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">적용 레벨:</span>
                    <span className="text-purple-400 font-semibold">
                      {Object.entries(gongBetLevels).filter(([_, enabled]) => enabled).length}개
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 푸터 */}
            <div className="border-t border-slate-700/50 p-6 flex justify-end gap-4">
              <Button
                variant="outline"
                onClick={() => setShowGongBetModal(false)}
                className="px-6 py-3 text-base"
              >
                취소
              </Button>
              <Button
                onClick={async () => {
                  await saveGongBetSettings();
                  setShowGongBetModal(false);
                }}
                className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 px-6 py-3 text-base font-semibold"
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
