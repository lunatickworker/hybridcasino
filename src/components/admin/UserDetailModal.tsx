import { Dialog, DialogContent } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { Alert, AlertDescription } from "../ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useState, useEffect, useRef } from "react";
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
  Loader2,
  GripVertical,
  Edit2,
  Save
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
  
  // ✅ 사용자 정보 수정 state
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editBankAccount, setEditBankAccount] = useState('');
  const [editBankHolder, setEditBankHolder] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [isUpdatingInfo, setIsUpdatingInfo] = useState(false);
  
  // ✅ 커미션 요율 state
  const [casinoRollingRate, setCasinoRollingRate] = useState('');
  const [losingRate, setLosingRate] = useState('');
  const [slotRollingRate, setSlotRollingRate] = useState('');
  const [isUpdatingCommission, setIsUpdatingCommission] = useState(false);

  // ✅ 로그인 비밀번호 state
  const [loginPassword, setLoginPassword] = useState('');
  const [loginPasswordConfirm, setLoginPasswordConfirm] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // ✅ 드래그 기능 state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, modalX: 0, modalY: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setWithdrawalPassword('');
      setPointConversionPassword('');
      setLoginPassword('');
      setLoginPasswordConfirm('');
      setShowLoginPassword(false);
      setActiveTab('info');
      setCasinoRollingRate('');
      setLosingRate('');
      setSlotRollingRate('');
      setIsDragging(false);
      setPosition({ x: 0, y: 0 });
      setIsEditingInfo(false);
    } else if (user) {
      // 모달이 열릴 때 현재 요율 값 로드
      setCasinoRollingRate(String(user.casino_rolling_commission || 0));
      setLosingRate(String(user.casino_losing_commission || 0));
      setSlotRollingRate(String(user.slot_rolling_commission || 0));
      
      // 사용자 정보 초기화
      setEditNickname(user.nickname || '');
      setEditEmail(user.email || '');
      setEditPhone(user.phone || '');
      setEditBankName(user.bank_name || '');
      setEditBankAccount(user.bank_account || '');
      setEditBankHolder(user.bank_holder || '');
      setEditMemo(user.memo || '');
    }
  }, [isOpen, user]);

  // ✅ 드래그 시작
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      modalX: position.x,
      modalY: position.y
    });
  };

  // ✅ 드래그 중
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      let newX = dragStart.modalX + deltaX;
      let newY = dragStart.modalY + deltaY;
      
      // 모달 크기: maxWidth 700px, 높이 약 400px (90vh 기준)
      // position은 화면 중앙(50%) 기준 offset이므로, 양수/음수 모두 가능
      const modalWidth = 350; // 700px의 절반 (중앙 기준)
      const modalHeight = 200; // 400px의 절반 (중앙 기준)
      
      const maxX = window.innerWidth / 2 - modalWidth; // 오른쪽 끝
      const minX = -(window.innerWidth / 2 - modalWidth); // 왼쪽 끝
      const maxY = window.innerHeight / 2 - modalHeight; // 아래쪽 끝
      const minY = -(window.innerHeight / 2 - modalHeight); // 위쪽 끝
      
      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

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

  // 로그인 비밀번호 업데이트
  const handleUpdateLoginPassword = async () => {
    if (!loginPassword.trim()) {
      toast.error('새 로그인 비밀번호를 입력해주세요.');
      return;
    }

    if (loginPassword.length < 6) {
      toast.error('로그인 비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (loginPassword !== loginPasswordConfirm) {
      toast.error('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const hashedPassword = bcrypt.hashSync(loginPassword.trim(), 10);
      
      const { error } = await supabase
        .from('users')
        .update({ password_hash: hashedPassword })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('로그인 비밀번호가 성공적으로 변경되었습니다.');
      setLoginPassword('');
      setLoginPasswordConfirm('');
      setShowLoginPassword(false);
    } catch (error: any) {
      console.error('로그인 비밀번호 변경 오류:', error);
      toast.error(error.message || '로그인 비밀번호 변경에 실패했습니다.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // 사용자 정보 업데이트
  const handleUpdateUserInfo = async () => {
    setIsUpdatingInfo(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          nickname: editNickname.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          bank_name: editBankName.trim() || null,
          bank_account: editBankAccount.trim() || null,
          bank_holder: editBankHolder.trim() || null,
          memo: editMemo.trim() || null,
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('사용자 정보가 성공적으로 수정되었습니다.');
      setIsEditingInfo(false);
    } catch (error: any) {
      console.error('사용자 정보 수정 오류:', error);
      toast.error(error.message || '사용자 정보 수정에 실패했습니다.');
    } finally {
      setIsUpdatingInfo(false);
    }
  };

  // 커미션 요율 업데이트
  const handleUpdateCommissionRates = async () => {
    if (!casinoRollingRate.trim() || !losingRate.trim() || !slotRollingRate.trim()) {
      toast.error('모든 커미션 요율을 입력해주세요.');
      return;
    }

    if (!/^\d+(\.\d+)?$/.test(casinoRollingRate.trim()) || !/^\d+(\.\d+)?$/.test(losingRate.trim()) || !/^\d+(\.\d+)?$/.test(slotRollingRate.trim())) {
      toast.error('커미션 요율은 숫자로 입력해주세요.');
      return;
    }

    setIsUpdatingCommission(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          casino_rolling_commission: parseFloat(casinoRollingRate.trim()),
          casino_losing_commission: parseFloat(losingRate.trim()), // 통합된 루징 요율
          slot_rolling_commission: parseFloat(slotRollingRate.trim()),
          slot_losing_commission: parseFloat(losingRate.trim()) // 통합된 루징 요율 (카지노/슬롯 공통)
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
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClose();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          style={{ 
            pointerEvents: 'auto',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }} 
        />
      )}
      <div
        ref={modalRef}
        className={`fixed z-50 transition-all duration-100 flex flex-col ${isDragging ? 'cursor-grabbing' : ''}`}
        style={{
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
          width: '70vw',
          maxWidth: '700px',
          height: '90vh',
          maxHeight: '90vh',
          left: '50%',
          top: '50%',
          pointerEvents: isOpen ? 'auto' : 'none',
          opacity: isOpen ? 1 : 0,
        }}
      >
        {/* 모달 컨테이너 */}
        <div
          className="flex flex-col rounded-xl shadow-2xl overflow-hidden h-full"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          style={{
            background: 'linear-gradient(135deg, rgba(20, 20, 35, 0.95) 0%, rgba(15, 15, 28, 0.95) 100%)',
            border: '2px solid rgba(193, 154, 107, 0.4)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 60px rgba(193, 154, 107, 0.2)',
            pointerEvents: 'auto'
          }}
        >
          {/* 헤더 - 드래그 가능 */}
          <div
            onMouseDown={handleMouseDown}
            className="flex items-center justify-between px-6 py-4 border-b cursor-grab active:cursor-grabbing select-none"
            style={{
              borderColor: 'rgba(193, 154, 107, 0.3)',
              background: 'linear-gradient(90deg, rgba(193, 154, 107, 0.1) 0%, rgba(166, 124, 82, 0.05) 100%)'
            }}
          >
            <div className="flex items-center gap-3">
              <GripVertical className="w-5 h-5 text-gray-500" />
              <div>
                <h2 className="text-xl font-bold" style={{ color: '#E6C9A8' }}>
                  {user?.nickname}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">@{user?.username}</p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="flex items-center justify-center w-10 h-10 rounded-lg transition-all hover:bg-red-500/20"
              style={{
                color: '#E6C9A8'
              }}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* 사용자 정보 요약 */}
          <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(193, 154, 107, 0.2)' }}>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg" style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(21, 128, 61, 0.05) 100%)',
                border: '1px solid rgba(34, 197, 94, 0.2)'
              }}>
                <div className="text-xs text-gray-400 mb-1">보유머니</div>
                <div className="text-lg font-bold text-green-400">
                  {Number(user?.balance || 0).toLocaleString()} 원
                </div>
              </div>
              <div className="p-3 rounded-lg" style={{
                background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(202, 138, 4, 0.05) 100%)',
                border: '1px solid rgba(234, 179, 8, 0.2)'
              }}>
                <div className="text-xs text-gray-400 mb-1">포인트</div>
                <div className="text-lg font-bold text-yellow-400">
                  {Number(user?.points || 0).toLocaleString()} P
                </div>
              </div>
              <div className="p-3 rounded-lg" style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <div className="text-xs text-gray-400 mb-1">상태</div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(user?.status)}
                  {user?.is_online && (
                    <Badge className="bg-blue-500/30 text-blue-300 text-xs border-blue-500/50">
                      온라인
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 탭 버튼 */}
          <div 
            className="flex gap-2 px-6 pt-4" 
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={{
              borderBottom: '1px solid rgba(193, 154, 107, 0.2)',
              pointerEvents: 'auto'
            }}
          >
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('info');
              }}
              className={`py-3 px-4 font-semibold text-sm transition-all rounded-t-lg ${
                activeTab === 'info'
                  ? 'border-b-2'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                borderBottomColor: activeTab === 'info' ? '#E6C9A8' : 'transparent',
                color: activeTab === 'info' ? '#E6C9A8' : undefined,
                pointerEvents: 'auto'
              }}
            >
              <Info className="w-4 h-4 inline mr-2" />
              기본 정보
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActiveTab('security');
              }}
              className={`py-3 px-4 font-semibold text-sm transition-all rounded-t-lg ${
                activeTab === 'security'
                  ? 'border-b-2'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                borderBottomColor: activeTab === 'security' ? '#E6C9A8' : 'transparent',
                color: activeTab === 'security' ? '#E6C9A8' : undefined,
                pointerEvents: 'auto'
              }}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              보안 설정
            </button>
          </div>

          {/* 콘텐츠 영역 */}
          <div className={`flex-1 overflow-y-auto px-6 py-6 ${activeTab === 'security' ? 'space-y-4' : 'space-y-6'}`} style={{ scrollBehavior: 'smooth' }}>
            {activeTab === 'info' ? (
            <>
              {/* 계정 정보 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                    <User className="w-5 h-5" />
                    계정 정보
                  </h4>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isEditingInfo) {
                        handleUpdateUserInfo();
                      } else {
                        setIsEditingInfo(true);
                      }
                    }}
                    disabled={isUpdatingInfo}
                    className="h-8 px-3 font-semibold text-xs"
                    style={{
                      background: isEditingInfo
                        ? 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)'
                        : 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                      border: '1px solid rgba(193, 154, 107, 0.2)'
                    }}
                  >
                    {isUpdatingInfo ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        저장중...
                      </>
                    ) : isEditingInfo ? (
                      <>
                        <Save className="w-3 h-3 mr-1" />
                        저장
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-3 h-3 mr-1" />
                        수정
                      </>
                    )}
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-base">아이디</Label>
                    <div className="p-3 rounded-lg bg-white/5 text-white text-sm">
                      {user.username}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-base">닉네임</Label>
                    {isEditingInfo ? (
                      <Input
                        value={editNickname}
                        onChange={(e) => setEditNickname(e.target.value)}
                        className="h-10 text-white text-sm"
                        style={{
                          background: 'rgba(20, 20, 35, 0.6)',
                          borderColor: 'rgba(193, 154, 107, 0.2)',
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-white/5 text-white text-sm">
                        {user.nickname}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-base flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      이메일
                    </Label>
                    {isEditingInfo ? (
                      <Input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="h-10 text-white text-sm"
                        style={{
                          background: 'rgba(20, 20, 35, 0.6)',
                          borderColor: 'rgba(193, 154, 107, 0.2)',
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-white/5 text-white text-sm">
                        {user.email || '-'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-base flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      전화번호
                    </Label>
                    {isEditingInfo ? (
                      <Input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="h-10 text-white text-sm"
                        style={{
                          background: 'rgba(20, 20, 35, 0.6)',
                          borderColor: 'rgba(193, 154, 107, 0.2)',
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-white/5 text-white text-sm">
                        {user.phone || '-'}
                      </div>
                    )}
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
                      <Label className="text-gray-400 text-base flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        은행명
                      </Label>
                      {isEditingInfo ? (
                        <Input
                          value={editBankName}
                          onChange={(e) => setEditBankName(e.target.value)}
                          placeholder="은행명 입력"
                          className="h-10 text-white text-sm"
                          style={{
                            background: 'rgba(20, 20, 35, 0.6)',
                            borderColor: 'rgba(193, 154, 107, 0.2)',
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="p-3 rounded-lg bg-white/5 text-white text-sm">
                          {user.bank_name || '-'}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-400 text-base">계좌번호</Label>
                      {isEditingInfo ? (
                        <Input
                          value={editBankAccount}
                          onChange={(e) => setEditBankAccount(e.target.value)}
                          placeholder="계좌번호 입력"
                          className="h-10 text-white text-sm font-mono"
                          style={{
                            background: 'rgba(20, 20, 35, 0.6)',
                            borderColor: 'rgba(193, 154, 107, 0.2)',
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="p-3 rounded-lg bg-white/5 text-white text-sm font-mono">
                          {user.bank_account || '-'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-base">예금주</Label>
                    {isEditingInfo ? (
                      <Input
                        value={editBankHolder}
                        onChange={(e) => setEditBankHolder(e.target.value)}
                        placeholder="예금주명 입력"
                        className="h-10 text-white text-sm"
                        style={{
                          background: 'rgba(20, 20, 35, 0.6)',
                          borderColor: 'rgba(193, 154, 107, 0.2)',
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-white/5 text-white text-sm">
                        {user.bank_holder || '-'}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-base flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      메모
                    </Label>
                    {isEditingInfo ? (
                      <textarea
                        value={editMemo}
                        onChange={(e) => setEditMemo(e.target.value)}
                        placeholder="메모 입력"
                        className="w-full p-3 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-1"
                        style={{
                          background: 'rgba(20, 20, 35, 0.6)',
                          borderColor: 'rgba(193, 154, 107, 0.2)',
                          border: '1px solid rgba(193, 154, 107, 0.2)',
                          minHeight: '60px'
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-white/5 text-white text-sm min-h-[60px] whitespace-pre-wrap">
                        {user.memo || '-'}
                      </div>
                    )}
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
                  로그인 비밀번호는 6자 이상으로 설정하세요. 출금/포인트전환 비밀번호는 숫자 4자리입니다.
                </AlertDescription>
              </Alert>

              {/* 로그인 비밀번호 변경 */}
              <div className="p-4 rounded-lg" style={{
                background: 'rgba(30, 30, 45, 0.4)',
                border: '1px solid rgba(193, 154, 107, 0.2)',
              }}>
                <h4 className="font-bold flex items-center gap-2 mb-4" style={{ color: '#E6C9A8' }}>
                  <Key className="w-5 h-5" />
                  로그인 비밀번호 변경
                </h4>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">새 비밀번호 (6자 이상)</Label>
                    <div className="flex gap-2">
                      <Input
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="새 비밀번호 입력"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="flex-1 h-10 text-white text-sm"
                        style={{
                          background: 'rgba(20, 20, 35, 0.6)',
                          borderColor: 'rgba(193, 154, 107, 0.2)',
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="px-3"
                      >
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">비밀번호 확인</Label>
                    <Input
                      type={showLoginPassword ? 'text' : 'password'}
                      placeholder="비밀번호 다시 입력"
                      value={loginPasswordConfirm}
                      onChange={(e) => setLoginPasswordConfirm(e.target.value)}
                      className="h-10 text-white text-sm"
                      style={{
                        background: 'rgba(20, 20, 35, 0.6)',
                        borderColor: loginPasswordConfirm && loginPassword !== loginPasswordConfirm ? 'rgba(239, 68, 68, 0.5)' : 'rgba(193, 154, 107, 0.2)',
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {loginPasswordConfirm && loginPassword !== loginPasswordConfirm && (
                      <p className="text-xs text-red-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        비밀번호가 일치하지 않습니다.
                      </p>
                    )}
                    {loginPasswordConfirm && loginPassword === loginPasswordConfirm && (
                      <p className="text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        비밀번호가 일치합니다.
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleUpdateLoginPassword}
                    disabled={isUpdatingPassword || !loginPassword || loginPassword !== loginPasswordConfirm}
                    className="w-full"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {isUpdatingPassword ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        변경 중...
                      </>
                    ) : (
                      <>
                        <Key className="w-4 h-4 mr-2" />
                        로그인 비밀번호 변경
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <Separator style={{ background: 'rgba(193, 154, 107, 0.2)' }} />

              {/* 비밀번호 설정 - 압축 레이아웃 */}
              <div className="space-y-3">
                <h4 className="font-bold flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <Lock className="w-5 h-5" />
                  기타 비밀번호 설정
                </h4>
                
                {/* 출금 비밀번호 */}
                <div className="p-4 rounded-lg" style={{
                  background: 'rgba(30, 30, 45, 0.4)',
                  border: '1px solid rgba(193, 154, 107, 0.2)',
                }}>
                  <Label className="text-gray-300 text-sm block mb-2">출금 비밀번호 (숫자 4자리)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="• • • •"
                      value={withdrawalPassword}
                      onChange={(e) => setWithdrawalPassword(e.target.value.replace(/\D/g, ''))}
                      maxLength={4}
                      className="flex-1 h-10 text-white text-sm"
                      style={{
                        background: 'rgba(20, 20, 35, 0.6)',
                        borderColor: 'rgba(193, 154, 107, 0.2)',
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateWithdrawalPassword();
                      }}
                      disabled={isUpdating || !withdrawalPassword.trim()}
                      className="h-10 px-3 font-semibold text-sm"
                      style={{
                        background: isUpdating || !withdrawalPassword.trim() 
                          ? 'rgba(100, 100, 100, 0.3)' 
                          : 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                        border: '1px solid rgba(193, 154, 107, 0.2)'
                      }}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* 포인트전환 비밀번호 */}
                <div className="p-4 rounded-lg" style={{
                  background: 'rgba(30, 30, 45, 0.4)',
                  border: '1px solid rgba(193, 154, 107, 0.2)',
                }}>
                  <Label className="text-gray-300 text-sm block mb-2">포인트전환 비밀번호 (숫자 4자리)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="• • • •"
                      value={pointConversionPassword}
                      onChange={(e) => setPointConversionPassword(e.target.value.replace(/\D/g, ''))}
                      maxLength={4}
                      className="flex-1 h-10 text-white text-sm"
                      style={{
                        background: 'rgba(20, 20, 35, 0.6)',
                        borderColor: 'rgba(193, 154, 107, 0.2)',
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdatePointConversionPassword();
                      }}
                      disabled={isUpdating || !pointConversionPassword.trim()}
                      className="h-10 px-3 font-semibold text-sm"
                      style={{
                        background: isUpdating || !pointConversionPassword.trim() 
                          ? 'rgba(100, 100, 100, 0.3)' 
                          : 'linear-gradient(135deg, #A67C52 0%, #8B6F47 100%)',
                        border: '1px solid rgba(193, 154, 107, 0.2)'
                      }}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* 보안 상태 */}
              <div className="space-y-2">
                <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <Shield className="w-4 h-4" />
                  보안 상태
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded text-center text-xs" style={{
                    background: user.withdrawal_password 
                      ? 'rgba(34, 197, 94, 0.1)' 
                      : 'rgba(234, 179, 8, 0.1)',
                    border: user.withdrawal_password 
                      ? '1px solid rgba(34, 197, 94, 0.3)' 
                      : '1px solid rgba(234, 179, 8, 0.3)'
                  }}>
                    <div className="font-semibold" style={{
                      color: user.withdrawal_password ? '#4ade80' : '#facc15'
                    }}>
                      {user.withdrawal_password ? '✓ 설정' : '미설정'}
                    </div>
                    <div className="text-gray-400 text-xs mt-1">출금 비밀번호</div>
                  </div>
                  <div className="p-3 rounded text-center text-xs" style={{
                    background: user.point_conversion_password 
                      ? 'rgba(34, 197, 94, 0.1)' 
                      : 'rgba(234, 179, 8, 0.1)',
                    border: user.point_conversion_password 
                      ? '1px solid rgba(34, 197, 94, 0.3)' 
                      : '1px solid rgba(234, 179, 8, 0.3)'
                  }}>
                    <div className="font-semibold" style={{
                      color: user.point_conversion_password ? '#4ade80' : '#facc15'
                    }}>
                      {user.point_conversion_password ? '✓ 설정' : '미설정'}
                    </div>
                    <div className="text-gray-400 text-xs mt-1">포인트전환 비밀번호</div>
                  </div>
                </div>
              </div>

              {/* 커미션 요율 설정 - 압축 레이아웃 */}
              <div className="space-y-3">
                <h4 className="font-bold flex items-center gap-2" style={{ color: '#E6C9A8' }}>
                  <Shield className="w-5 h-5" />
                  커미션 요율 (%)
                </h4>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm block">카지노 롤링</Label>
                    <Input
                      type="text"
                      placeholder="0.0"
                      value={casinoRollingRate}
                      onChange={(e) => setCasinoRollingRate(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="h-10 text-white text-sm"
                      style={{
                        background: 'rgba(20, 20, 35, 0.6)',
                        borderColor: 'rgba(193, 154, 107, 0.2)',
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm block">루징 공통</Label>
                    <Input
                      type="text"
                      placeholder="0.0"
                      value={losingRate}
                      onChange={(e) => setLosingRate(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="h-10 text-white text-sm"
                      style={{
                        background: 'rgba(20, 20, 35, 0.6)',
                        borderColor: 'rgba(193, 154, 107, 0.2)',
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm block">슬롯 롤링</Label>
                    <Input
                      type="text"
                      placeholder="0.0"
                      value={slotRollingRate}
                      onChange={(e) => setSlotRollingRate(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="h-10 text-white text-sm"
                      style={{
                        background: 'rgba(20, 20, 35, 0.6)',
                        borderColor: 'rgba(193, 154, 107, 0.2)',
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdateCommissionRates();
                    }}
                    disabled={isUpdatingCommission || !casinoRollingRate.trim() || !losingRate.trim() || !slotRollingRate.trim()}
                    className="flex-1 h-10 px-4 font-semibold text-sm"
                    style={{
                      background: isUpdatingCommission || !casinoRollingRate.trim() || !losingRate.trim() || !slotRollingRate.trim()
                        ? 'rgba(100, 100, 100, 0.3)' 
                        : 'linear-gradient(135deg, #C19A6B 0%, #A67C52 100%)',
                      border: '1px solid rgba(193, 154, 107, 0.2)'
                    }}
                  >
                    {isUpdatingCommission ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin inline" />
                        설정 중...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3 h-3 mr-2 inline" />
                        저장
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                    className="flex-1 h-10 font-semibold text-sm"
                    style={{
                      background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.2) 0%, rgba(166, 124, 82, 0.1) 100%)',
                      border: '1px solid rgba(193, 154, 107, 0.3)',
                      color: '#E6C9A8'
                    }}
                  >
                    닫기
                  </Button>
                </div>
              </div>
            </>
          )}
          </div>

          {/* 푸터 - Info 탭에서만 표시 */}
          {activeTab === 'info' && (
            <div className="px-6 py-4 border-t" style={{
              borderColor: 'rgba(193, 154, 107, 0.2)',
              background: 'linear-gradient(90deg, rgba(193, 154, 107, 0.05) 0%, rgba(166, 124, 82, 0.02) 100%)'
            }}>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="w-full h-11 font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, rgba(193, 154, 107, 0.2) 0%, rgba(166, 124, 82, 0.1) 100%)',
                  border: '1px solid rgba(193, 154, 107, 0.3)',
                  color: '#E6C9A8'
                }}
              >
                닫기
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}