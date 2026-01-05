import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { Alert, AlertDescription } from "../ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { toast } from "sonner@2.0.3";
import bcrypt from 'bcryptjs';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  CreditCard, 
  Building2, 
  Shield, 
  Key,
  Lock,
  Wallet,
  Info,
  AlertCircle,
  CheckCircle,
  X,
  Eye,
  EyeOff,
  UserPlus,
  XCircle,
  Loader2
} from "lucide-react";

interface UserDetailModalProps {
  user: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserDetailModal({ user, isOpen, onClose }: UserDetailModalProps) {
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [pointConversionPassword, setPointConversionPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'security'>('info');
  
  // ✅ 커미션 요율 state
  const [casinoRollingRate, setCasinoRollingRate] = useState('');
  const [casinoLosingRate, setCasinoLosingRate] = useState('');
  const [slotRollingRate, setSlotRollingRate] = useState('');
  const [slotLosingRate, setSlotLosingRate] = useState('');
  const [isUpdatingCommission, setIsUpdatingCommission] = useState(false);

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setWithdrawalPassword('');
      setPointConversionPassword('');
      setActiveTab('info');
      setCasinoRollingRate('');
      setCasinoLosingRate('');
      setSlotRollingRate('');
      setSlotLosingRate('');
    } else if (user) {
      // 모달이 열릴 때 현재 요율 값 로드
      setCasinoRollingRate(String(user.casino_rolling_commission || 0));
      setCasinoLosingRate(String(user.casino_losing_commission || 0));
      setSlotRollingRate(String(user.slot_rolling_commission || 0));
      setSlotLosingRate(String(user.slot_losing_commission || 0));
    }
  }, [isOpen, user]);

  if (!user) return null;

  // 상태에 따른 배지 색상
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      'active': { label: '활성', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
      'pending': { label: '대기중', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
      'blocked': { label: '차단됨', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
      'suspended': { label: '정지됨', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    };
    const config = statusConfig[status] || statusConfig['pending'];
    return <Badge className={`${config.className} border`}>{config.label}</Badge>;
  };

  // 출금 비밀번호 업데이트
  const handleUpdateWithdrawalPassword = async () => {
    if (!withdrawalPassword.trim()) {
      toast.error('출금 비밀번호를 입력해주세요.');
      return;
    }

    if (!/^\d{4}$/.test(withdrawalPassword.trim())) {
      toast.error('출금 비밀번호는 숫자 4자리로 입력해주세요.');
      return;
    }

    setIsUpdating(true);
    try {
      const hashedPassword = bcrypt.hashSync(withdrawalPassword.trim(), 10);
      
      const { error } = await supabase
        .from('users')
        .update({ withdrawal_password: hashedPassword })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('출금 비밀번호가 성공적으로 설정되었습니다.');
      setWithdrawalPassword('');
    } catch (error: any) {
      console.error('출금 비밀번호 설정 오류:', error);
      toast.error(error.message || '출금 비밀번호 설정에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  // 포인트전환 비밀번호 업데이트
  const handleUpdatePointConversionPassword = async () => {
    if (!pointConversionPassword.trim()) {
      toast.error('포인트전환 비밀번호를 입력해주세요.');
      return;
    }

    if (!/^\d{4}$/.test(pointConversionPassword.trim())) {
      toast.error('포인트전환 비밀번호는 숫자 4자리로 입력해주세요.');
      return;
    }

    setIsUpdating(true);
    try {
      const hashedPassword = bcrypt.hashSync(pointConversionPassword.trim(), 10);
      
      const { error } = await supabase
        .from('users')
        .update({ point_conversion_password: hashedPassword })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('포인트전환 비밀번호가 성공적으로 설정되었습니다.');
      setPointConversionPassword('');
    } catch (error: any) {
      console.error('포인트전환 비밀번호 설정 오류:', error);
      toast.error(error.message || '포인트전환 비밀번호 설정에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  // 커미션 요율 업데이트
  const handleUpdateCommissionRates = async () => {
    if (!casinoRollingRate.trim() || !casinoLosingRate.trim() || !slotRollingRate.trim() || !slotLosingRate.trim()) {
      toast.error('모든 커미션 요율을 입력해주세요.');
      return;
    }

    if (!/^\d+(\.\d+)?$/.test(casinoRollingRate.trim()) || !/^\d+(\.\d+)?$/.test(casinoLosingRate.trim()) || !/^\d+(\.\d+)?$/.test(slotRollingRate.trim()) || !/^\d+(\.\d+)?$/.test(slotLosingRate.trim())) {
      toast.error('커미션 요율은 숫자로 입력해주세요.');
      return;
    }

    setIsUpdatingCommission(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          casino_rolling_commission: parseFloat(casinoRollingRate.trim()),
          casino_losing_commission: parseFloat(casinoLosingRate.trim()),
          slot_rolling_commission: parseFloat(slotRollingRate.trim()),
          slot_losing_commission: parseFloat(slotLosingRate.trim())
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('커미션 요율이 성공적으로 설정되었습니다.');
    } catch (error: any) {
      console.error('커미션 요율 설정 오류:', error);
      toast.error(error.message || '커미션 요율 설정에 실패했습니다.');
    } finally {
      setIsUpdatingCommission(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 15, 25, 0.98) 0%, rgba(10, 10, 20, 0.98) 100%)',
          borderColor: 'rgba(193, 154, 107, 0.3)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(193, 154, 107, 0.1)',
        }}
      >
        {/* Header */}
        <DialogHeader className="space-y-4 pb-4 border-b" style={{ borderColor: 'rgba(193, 154, 107, 0.2)' }}>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3" style={{ color: '#E6C9A8' }}>
              <User className="w-6 h-6" />
              <span>회원 상세 정보</span>
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DialogDescription className="sr-only">
            회원의 기본 정보, 계좌 정보, 거래 통계 및 보안 설정을 확인하고 관리할 수 있습니다.
          </DialogDescription>
          
          {/* User Overview */}
          <div className="flex items-center gap-4 p-4 rounded-lg" style={{
            background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
            borderColor: 'rgba(193, 154, 107, 0.2)',
            border: '1px solid'
          }}>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold" style={{ color: '#E6C9A8' }}>
                  {user.nickname}
                </h3>
                {getStatusBadge(user.status)}
                {user.is_online && (
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 border">
                    접속중
                  </Badge>
                )}
              </div>
              <p className="text-gray-400">@{user.username}</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400 mb-1">현재 잔액</div>
              <div className="text-2xl font-bold" style={{ color: '#E6C9A8' }}>
                {Number(user.balance || 0).toLocaleString()} 원
              </div>
              <div className="text-sm text-gray-500 mt-1">
                포인트: {Number(user.points || 0).toLocaleString()} P
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 mt-4 mb-4">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
              activeTab === 'info' 
                ? 'bg-gradient-to-r from-[#C19A6B] to-[#A67C52] text-white shadow-lg' 
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            <Info className="w-4 h-4 inline mr-2" />
            기본 정보
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
              activeTab === 'security' 
                ? 'bg-gradient-to-r from-[#C19A6B] to-[#A67C52] text-white shadow-lg' 
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            <Shield className="w-4 h-4 inline mr-2" />
            보안 설정
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-6">
          {activeTab === 'info' ? (
            <>
              {/* 계정 정보 */}
              <div className="space-y-4">
                <h4 className="font-bold flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <User className="w-5 h-5" />
                  계정 정보
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm">아이디</Label>
                    <div className="p-3 rounded-lg bg-white/5 text-white">
                      {user.username}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm">닉네임</Label>
                    <div className="p-3 rounded-lg bg-white/5 text-white">
                      {user.nickname}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      이메일
                    </Label>
                    <div className="p-3 rounded-lg bg-white/5 text-white">
                      {user.email || '-'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      전화번호
                    </Label>
                    <div className="p-3 rounded-lg bg-white/5 text-white">
                      {user.phone || '-'}
                    </div>
                  </div>
                </div>
              </div>

              <Separator style={{ background: 'rgba(193, 154, 107, 0.2)' }} />

              {/* 계좌 정보 */}
              <div className="space-y-4">
                <h4 className="font-bold flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <CreditCard className="w-5 h-5" />
                  계좌 정보
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 2fr' }}>
                    <div className="space-y-2">
                      <Label className="text-gray-400 text-sm flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        은행명
                      </Label>
                      <div className="p-3 rounded-lg bg-white/5 text-white">
                        {user.bank_name || '-'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-400 text-sm">계좌번호</Label>
                      <div className="p-3 rounded-lg bg-white/5 text-white font-mono">
                        {user.bank_account || '-'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm">예금주</Label>
                    <div className="p-3 rounded-lg bg-white/5 text-white">
                      {user.bank_holder || '-'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-sm flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      메모
                    </Label>
                    <div className="p-3 rounded-lg bg-white/5 text-white min-h-[60px]">
                      {user.memo || '-'}
                    </div>
                  </div>
                </div>
              </div>

              <Separator style={{ background: 'rgba(193, 154, 107, 0.2)' }} />

              {/* 통계 정보 */}
              <div className="space-y-4">
                <h4 className="font-bold flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <Wallet className="w-5 h-5" />
                  거래 통계
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg" style={{
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(21, 128, 61, 0.1) 100%)',
                    border: '1px solid rgba(34, 197, 94, 0.3)'
                  }}>
                    <div className="text-sm text-green-400 mb-1">총 입금</div>
                    <div className="text-xl font-bold text-green-300">
                      {Number(user.total_deposit || 0).toLocaleString()} 원
                    </div>
                  </div>
                  <div className="p-4 rounded-lg" style={{
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(185, 28, 28, 0.1) 100%)',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}>
                    <div className="text-sm text-red-400 mb-1">총 출금</div>
                    <div className="text-xl font-bold text-red-300">
                      {Number(user.total_withdraw || 0).toLocaleString()} 원
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5">
                    <div className="text-sm text-gray-400 mb-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      가입일
                    </div>
                    <div className="text-white">
                      {user.created_at ? new Date(user.created_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-white/5">
                    <div className="text-sm text-gray-400 mb-1">최근 접속</div>
                    <div className="text-white">
                      {user.last_login_at ? new Date(user.last_login_at).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* 보안 설정 섹션 */}
              <Alert className="border" style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%)',
                borderColor: 'rgba(59, 130, 246, 0.3)'
              }}>
                <Info className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-300">
                  출금 및 포인트전환 비밀번호는 숫자 4자리로 설정해야 합니다. 기존 비밀번호가 있는 경우 덮어쓰기 됩니다.
                </AlertDescription>
              </Alert>

              {/* 출금 비밀번호 설정 */}
              <div className="p-6 rounded-lg space-y-4" style={{
                background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
                border: '2px solid rgba(193, 154, 107, 0.3)',
                boxShadow: '0 8px 32px rgba(193, 154, 107, 0.1)'
              }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg" style={{
                    background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                  }}>
                    <Lock className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold" style={{ color: '#E6C9A8' }}>
                      출금 비밀번호 설정
                    </h4>
                    <p className="text-sm text-gray-400">
                      회원의 출금 요청 시 사용되는 비밀번호입니다
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    새 출금 비밀번호 (숫자 4자리)
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      type="password"
                      placeholder="• • • •"
                      value={withdrawalPassword}
                      onChange={(e) => setWithdrawalPassword(e.target.value.replace(/\D/g, ''))}
                      maxLength={4}
                      className="flex-1 h-12 text-lg text-white"
                      style={{
                        background: 'rgba(20, 20, 35, 0.8)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                      }}
                    />
                    <Button
                      onClick={handleUpdateWithdrawalPassword}
                      disabled={isUpdating || !withdrawalPassword.trim()}
                      className="h-12 px-6 font-semibold"
                      style={{
                        background: isUpdating || !withdrawalPassword.trim() 
                          ? 'rgba(100, 100, 100, 0.5)' 
                          : 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                        border: '1px solid rgba(193, 154, 107, 0.3)'
                      }}
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          설정 중...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          설정
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => setWithdrawalPassword('')}
                      disabled={!withdrawalPassword.trim()}
                      className="h-12 px-6 font-semibold"
                      style={{
                        background: !withdrawalPassword.trim()
                          ? 'rgba(100, 100, 100, 0.5)'
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.6) 0%, rgba(185, 28, 28, 0.6) 100%)',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      리셋
                    </Button>
                  </div>
                </div>
              </div>

              {/* 포인트전환 비밀번호 설정 */}
              <div className="p-6 rounded-lg space-y-4" style={{
                background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
                border: '2px solid rgba(193, 154, 107, 0.3)',
                boxShadow: '0 8px 32px rgba(193, 154, 107, 0.1)'
              }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg" style={{
                    background: 'linear-gradient(135deg, #A67C52 0%, #8B6F47 100%)',
                  }}>
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold" style={{ color: '#E6C9A8' }}>
                      포인트전환 비밀번호 설정
                    </h4>
                    <p className="text-sm text-gray-400">
                      포인트를 머니로 전환할 때 사용되는 비밀번호입니다
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    새 포인트전환 비밀번호 (숫자 4자리)
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      type="password"
                      placeholder="예: 1234"
                      value={pointConversionPassword}
                      onChange={(e) => setPointConversionPassword(e.target.value.replace(/\D/g, ''))}
                      maxLength={4}
                      className="flex-1 h-12 text-lg text-white"
                      style={{
                        background: 'rgba(20, 20, 35, 0.8)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                      }}
                    />
                    <Button
                      onClick={handleUpdatePointConversionPassword}
                      disabled={isUpdating || !pointConversionPassword.trim()}
                      className="h-12 px-6 font-semibold"
                      style={{
                        background: isUpdating || !pointConversionPassword.trim() 
                          ? 'rgba(100, 100, 100, 0.5)' 
                          : 'linear-gradient(135deg, #A67C52 0%, #8B6F47 100%)',
                        border: '1px solid rgba(193, 154, 107, 0.3)'
                      }}
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          설정 중...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          설정
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => setPointConversionPassword('')}
                      disabled={!pointConversionPassword.trim()}
                      className="h-12 px-6 font-semibold"
                      style={{
                        background: !pointConversionPassword.trim()
                          ? 'rgba(100, 100, 100, 0.5)'
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.6) 0%, rgba(185, 28, 28, 0.6) 100%)',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      리셋
                    </Button>
                  </div>
                </div>
              </div>

              {/* 보안 상태 */}
              <div className="space-y-4">
                <h4 className="font-bold flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <Shield className="w-5 h-5" />
                  보안 상태
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-lg" style={{
                    background: user.withdrawal_password 
                      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(21, 128, 61, 0.15) 100%)'
                      : 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(161, 98, 7, 0.15) 100%)',
                    border: user.withdrawal_password 
                      ? '1px solid rgba(34, 197, 94, 0.4)' 
                      : '1px solid rgba(234, 179, 8, 0.4)'
                  }}>
                    <div className="text-sm text-gray-300 mb-3">출금 비밀번호</div>
                    <div className="flex items-center gap-2">
                      {user.withdrawal_password ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          <span className="text-green-300 font-semibold text-lg">설정됨</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-yellow-400" />
                          <span className="text-yellow-300 font-semibold text-lg">미설정</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="p-5 rounded-lg" style={{
                    background: user.point_conversion_password 
                      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(21, 128, 61, 0.15) 100%)'
                      : 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(161, 98, 7, 0.15) 100%)',
                    border: user.point_conversion_password 
                      ? '1px solid rgba(34, 197, 94, 0.4)' 
                      : '1px solid rgba(234, 179, 8, 0.4)'
                  }}>
                    <div className="text-sm text-gray-300 mb-3">포인트전환 비밀번호</div>
                    <div className="flex items-center gap-2">
                      {user.point_conversion_password ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-green-400" />
                          <span className="text-green-300 font-semibold text-lg">설정됨</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-yellow-400" />
                          <span className="text-yellow-300 font-semibold text-lg">미설정</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 커미션 요율 설정 */}
              <div className="p-6 rounded-lg space-y-4" style={{
                background: 'linear-gradient(135deg, rgba(30, 30, 45, 0.6) 0%, rgba(20, 20, 35, 0.6) 100%)',
                border: '2px solid rgba(193, 154, 107, 0.3)',
                boxShadow: '0 8px 32px rgba(193, 154, 107, 0.1)'
              }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg" style={{
                    background: 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                  }}>
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold" style={{ color: '#E6C9A8' }}>
                      커미션 요율 설정
                    </h4>
                    <p className="text-sm text-gray-400">
                      각 게임의 커미션 요율을 설정합니다
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    카지노 롤링 커미션 요율 (%)
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      placeholder="예: 1.5"
                      value={casinoRollingRate}
                      onChange={(e) => setCasinoRollingRate(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="flex-1 h-12 text-lg text-white"
                      style={{
                        background: 'rgba(20, 20, 35, 0.8)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    카지노 패배 커미션 요율 (%)
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      placeholder="예: 1.5"
                      value={casinoLosingRate}
                      onChange={(e) => setCasinoLosingRate(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="flex-1 h-12 text-lg text-white"
                      style={{
                        background: 'rgba(20, 20, 35, 0.8)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    슬롯 롤링 커미션 요율 (%)
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      placeholder="예: 1.5"
                      value={slotRollingRate}
                      onChange={(e) => setSlotRollingRate(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="flex-1 h-12 text-lg text-white"
                      style={{
                        background: 'rgba(20, 20, 35, 0.8)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-gray-300 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    슬롯 패배 커미션 요율 (%)
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      placeholder="예: 1.5"
                      value={slotLosingRate}
                      onChange={(e) => setSlotLosingRate(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="flex-1 h-12 text-lg text-white"
                      style={{
                        background: 'rgba(20, 20, 35, 0.8)',
                        borderColor: 'rgba(193, 154, 107, 0.3)',
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <Button
                    onClick={handleUpdateCommissionRates}
                    disabled={isUpdatingCommission}
                    className="h-12 px-6 font-semibold"
                    style={{
                      background: isUpdatingCommission 
                        ? 'rgba(100, 100, 100, 0.5)' 
                        : 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                      border: '1px solid rgba(193, 154, 107, 0.3)'
                    }}
                  >
                    {isUpdatingCommission ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        설정 중...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        설정
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t mt-4" style={{ borderColor: 'rgba(193, 154, 107, 0.2)' }}>
          <Button
            onClick={onClose}
            className="w-full h-12 font-semibold"
            style={{
              background: 'linear-gradient(135deg, rgba(60, 60, 80, 0.8) 0%, rgba(40, 40, 60, 0.8) 100%)',
              borderColor: 'rgba(193, 154, 107, 0.3)',
              border: '1px solid'
            }}
          >
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}