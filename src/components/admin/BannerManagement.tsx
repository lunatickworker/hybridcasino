import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { DataTable } from "../common/DataTable";
import { AdminDialog as Dialog, AdminDialogContent as DialogContent, AdminDialogDescription as DialogDescription, AdminDialogHeader as DialogHeader, AdminDialogTitle as DialogTitle } from "./AdminDialog";
import { 
  Image, Save, Plus, Edit, Trash2, Eye, FileText, Calendar, Users, Upload, X, Info
} from "lucide-react";
import { toast } from "sonner@2.0.3";
import { Partner } from "../../types";
import { supabase } from "../../lib/supabase";
import { MetricCard } from "./MetricCard";
import { useLanguage } from "../../contexts/LanguageContext";

interface Banner {
  id: string;
  partner_id: string;
  title: string;
  content: string;
  image_url?: string;
  banner_type: 'popup' | 'banner';
  target_audience: 'all' | 'users' | 'partners';
  target_level?: number;
  status: 'active' | 'inactive';
  display_order: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

interface BannerManagementProps {
  user: Partner;
}

export function BannerManagement({ user }: BannerManagementProps) {
  const { t } = useLanguage();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(false); // ⚡ 초기 로딩을 false로 유지
  const [saving, setSaving] = useState(false);
  const [editingBanner, setEditingBanner] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [timezoneOffset, setTimezoneOffset] = useState<number>(9); // 기본값 UTC+9
  
  const [bannerForm, setBannerForm] = useState<Partial<Banner>>({
    title: '',
    content: '',
    image_url: '',
    banner_type: 'popup',
    target_audience: 'users',
    status: 'active',
    display_order: 0,
  });

  useEffect(() => {
    loadInitialData();
  }, [user.id]);

  // ⚡ 초기 데이터 로드 최적화 - 병렬 처리
  const loadInitialData = async () => {
    try {
      // 타임존 설정과 배너 데이터를 병렬로 조회
      const [timezoneResult, bannersResult] = await Promise.all([
        supabase
          .from('system_settings')
          .select('setting_value')
          .eq('setting_key', 'timezone_offset')
          .maybeSingle(),
        user.level > 1
          ? supabase
              .from('banners')
              .select('*')
              .eq('partner_id', user.id)
              .order('display_order', { ascending: true })
          : supabase
              .from('banners')
              .select('*')
              .order('display_order', { ascending: true })
      ]);

      // 타임존 설정 처리
      if (!timezoneResult.error && timezoneResult.data) {
        setTimezoneOffset(parseInt(timezoneResult.data.setting_value));
        console.log('📅 [배너 관리] 시스템 타임존:', `UTC${parseInt(timezoneResult.data.setting_value) >= 0 ? '+' : ''}${timezoneResult.data.setting_value}`);
      }

      // 배너 데이터 처리
      if (bannersResult.error) throw bannersResult.error;
      setBanners(bannersResult.data || []);
    } catch (error) {
      console.error('초기 데이터 로드 실패:', error);
      toast.error(t.bannerManagement.loadBannersFailed);
    }
  };

  // ⚡ 배너 목록 재조회 (저장/삭제 후)
  const loadBanners = async () => {
    try {
      let query = supabase
        .from('banners')
        .select('*')
        .order('display_order', { ascending: true });

      // 시스템관리자가 아닌 경우 자신의 배너만 조회
      if (user.level > 1) {
        query = query.eq('partner_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setBanners(data || []);
    } catch (error) {
      console.error('배너 로드 실패:', error);
      toast.error(t.bannerManagement.loadBannersFailed);
    }
  };

  // 이미지 파일 선택 처리
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 크기 체크 (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t.bannerManagement.fileSizeTooLarge);
      return;
    }

    // 파일 형식 체크
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t.bannerManagement.invalidFileFormat);
      return;
    }

    setSelectedImageFile(file);

    // 미리보기 생성
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 이미지 제거
  const handleImageRemove = () => {
    setSelectedImageFile(null);
    setImagePreview(null);
    setBannerForm(prev => ({ ...prev, image_url: '' }));
  };

  // 이미지 업로드
  const uploadImage = async (): Promise<string | null> => {
    if (!selectedImageFile) return bannerForm.image_url || null;

    setUploadingImage(true);
    try {
      const fileExt = selectedImageFile.name.split('.').pop();
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Supabase Storage에 업로드
      const { error: uploadError } = await supabase.storage
        .from('banner')
        .upload(filePath, selectedImageFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('이미지 업로드 에러:', uploadError);
        throw uploadError;
      }

      // Public URL 가져오기
      const { data: { publicUrl } } = supabase.storage
        .from('banner')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('이미지 업로드 실패:', error);
      toast.error(t.bannerManagement.imageUploadFailed);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const saveBanner = async () => {
    if (!bannerForm.title?.trim()) {
      toast.error(t.bannerManagement.enterTitle);
      return;
    }

    // ✅ 이미지 또는 설명 중 하나는 필수
    if (!bannerForm.content?.trim() && !bannerForm.image_url && !selectedImageFile) {
      toast.error(t.bannerManagement.enterContentOrImage || '이미지 또는 설명 중 하나는 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      // 이미지 업로드 (새 이미지가 선택된 경우)
      let imageUrl = bannerForm.image_url;
      if (selectedImageFile) {
        const uploadedUrl = await uploadImage();
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        } else {
          setSaving(false);
          return;
        }
      }

      // datetime-local 값을 ISO 문자열로 변환 (시스템 타임존 적용)
      const formatDateToISO = (dateString?: string) => {
        if (!dateString) return null;
        try {
          // datetime-local 형식: "2025-11-14T16:20"
          // 시스템 타임존(UTC+9 등)을 적용하여 ISO 8601 형식으로 변환
          const offset = timezoneOffset * 60; // 분 단위
          const sign = offset >= 0 ? '+' : '-';
          const absOffset = Math.abs(offset);
          const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
          const minutes = String(absOffset % 60).padStart(2, '0');
          
          const isoString = `${dateString}:00${sign}${hours}:${minutes}`;
          console.log(`📅 [배너 저장] ${dateString} → ${isoString}`);
          
          return isoString;
        } catch (e) {
          console.error('날짜 변환 오류:', e);
          return null;
        }
      };

      const bannerData = {
        ...bannerForm,
        image_url: imageUrl,
        partner_id: user.id,
        updated_at: new Date().toISOString(),
        start_date: formatDateToISO(bannerForm.start_date),
        end_date: formatDateToISO(bannerForm.end_date),
      };

      if (editingBanner) {
        const { error } = await supabase
          .from('banners')
          .update(bannerData)
          .eq('id', editingBanner);

        if (error) throw error;
        toast.success(t.bannerManagement.bannerUpdated);
      } else {
        const { error } = await supabase
          .from('banners')
          .insert({
            ...bannerData,
            created_at: new Date().toISOString(),
          });

        if (error) throw error;
        toast.success(t.bannerManagement.bannerCreated);
      }

      resetForm();
      await loadBanners();
    } catch (error) {
      console.error('배너 저장 실패:', error);
      toast.error(t.bannerManagement.saveBannerFailed);
    } finally {
      setSaving(false);
    }
  };

  const deleteBanner = async (bannerId: string) => {
    if (!confirm(t.bannerManagement.confirmDelete)) return;

    try {
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', bannerId);

      if (error) throw error;
      toast.success(t.bannerManagement.bannerDeleted);
      await loadBanners();
    } catch (error) {
      console.error('배너 삭제 실패:', error);
      toast.error(t.bannerManagement.deleteBannerFailed);
    }
  };

  const editBanner = (banner: Banner) => {
    // UTC 시간을 시스템 타임존으로 변환하여 datetime-local input에 표시
    const formatForInput = (dateString?: string) => {
      if (!dateString) return '';
      
      // UTC 시간을 시스템 타임존으로 변환
      const utcDate = new Date(dateString);
      const localTime = utcDate.getTime() + (timezoneOffset * 3600000);
      const localDate = new Date(localTime);
      
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const hours = String(localDate.getHours()).padStart(2, '0');
      const minutes = String(localDate.getMinutes()).padStart(2, '0');
      
      console.log(`📅 [배너 편집] UTC: ${dateString} → 시스템 타임존: ${year}-${month}-${day}T${hours}:${minutes}`);
      
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    setBannerForm({
      title: banner.title,
      content: banner.content,
      image_url: banner.image_url,
      banner_type: banner.banner_type,
      target_audience: banner.target_audience,
      target_level: banner.target_level,
      status: banner.status,
      display_order: banner.display_order,
      start_date: formatForInput(banner.start_date),
      end_date: formatForInput(banner.end_date),
    });
    setEditingBanner(banner.id);
    setSelectedImageFile(null);
    setImagePreview(banner.image_url || null);
    setShowForm(true);
  };

  const resetForm = () => {
    setBannerForm({
      title: '',
      content: '',
      image_url: '',
      banner_type: 'popup',
      target_audience: 'users',
      status: 'active',
      display_order: 0,
    });
    setEditingBanner(null);
    setSelectedImageFile(null);
    setImagePreview(null);
    setShowForm(false);
  };

  const previewBanner = (banner: Banner) => {
    const previewWindow = window.open('', '_blank', 'width=700,height=800');
    if (previewWindow) {
      previewWindow.document.write(`
        <html>
          <head>
            <title>${t.bannerManagement.previewTitle} - ${banner.title}</title>
            <style>
              body { 
                margin: 0; 
                padding: 20px; 
                font-family: sans-serif; 
                background: rgba(0, 0, 0, 0.7); 
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
              }
              .banner-preview { 
                border: 2px solid rgba(249, 115, 22, 0.5); 
                padding: 32px; 
                max-width: 90vw;
                max-height: 85vh;
                overflow-y: auto;
                background: linear-gradient(to bottom right, #0f172a, #1e293b); 
                color: #fff; 
                border-radius: 16px;
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
                position: relative;
              }
              .banner-title { 
                margin: 0 0 24px 0; 
                color: #f97316; 
                font-size: 24px;
                font-weight: bold;
                text-align: center;
              }
              .banner-content { 
                line-height: 1.6; 
                color: #e2e8f0;
                margin-bottom: 24px;
              }
              .banner-image { 
                width: 100%; 
                height: auto; 
                margin: 0 0 24px 0; 
                border-radius: 8px;
                border: 1px solid #334155;
                max-height: 60vh;
                object-fit: contain;
              }
              .banner-footer {
                margin-top: 16px;
                padding-top: 12px;
                border-top: 1px solid rgba(100, 116, 139, 0.5);
                text-align: center;
              }
              .close-text {
                color: #94a3b8;
                font-size: 14px;
                cursor: pointer;
                padding: 8px 16px;
                border-radius: 8px;
                display: inline-block;
              }
              .close-text:hover {
                color: #fff;
                background: rgba(100, 116, 139, 0.3);
              }
            </style>
          </head>
          <body>
            <div class="banner-preview">
              <h3 class="banner-title">${banner.title}</h3>
              ${banner.image_url ? `<img src="${banner.image_url}" class="banner-image" alt="${banner.title}" />` : ''}
              ${banner.content ? `<div class="banner-content">${banner.content}</div>` : ''}
              <div class="banner-footer">
                <span class="close-text">오늘은 그만 열기</span>
              </div>
            </div>
          </body>
        </html>
      `);
    }
  };

  const bannerColumns = [
    {
      key: "title",
      title: t.bannerManagement.bannerTitle,
      sortable: true,
      cell: (banner: Banner) => (
        <div className="max-w-xs">
          <p className="text-base font-bold truncate">{banner.title}</p>
          {banner.image_url && (
            <p className="text-sm text-slate-400 mt-0.5">{t.bannerManagement.imageIncluded}</p>
          )}
        </div>
      ),
    },
    {
      key: "banner_type",
      title: t.bannerManagement.bannerType,
      cell: (banner: Banner) => (
        <Badge variant={banner.banner_type === 'popup' ? 'default' : 'secondary'} className="text-sm px-3 py-1 font-semibold">
          {banner.banner_type === 'popup' ? t.bannerManagement.popup : t.bannerManagement.banner}
        </Badge>
      ),
    },
    {
      key: "target_audience",
      title: t.bannerManagement.targetAudience,
      cell: (banner: Banner) => (
        <div className="space-y-1">
          <Badge variant="outline" className="text-sm px-3 py-1 font-semibold">
            {banner.target_audience === 'all' ? 'All' : 
             banner.target_audience === 'users' ? 'Users' : 'Partners'}
          </Badge>
          {banner.target_level && (
            <p className="text-sm text-slate-400 mt-0.5">Level {banner.target_level}</p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      title: t.common.status,
      cell: (banner: Banner) => (
        <Badge variant={banner.status === 'active' ? 'default' : 'secondary'} className="text-sm px-3 py-1 font-semibold">
          {banner.status === 'active' ? t.bannerManagement.active : t.bannerManagement.inactive}
        </Badge>
      ),
    },
    {
      key: "display_order",
      title: t.bannerManagement.order,
      sortable: true,
      cell: (banner: Banner) => (
        <span className="text-base font-semibold">{banner.display_order}</span>
      ),
    },
    {
      key: "actions",
      title: t.common.actions,
      cell: (banner: Banner) => (
        <div className="flex gap-2">
          <Button
            onClick={() => previewBanner(banner)}
            variant="outline"
            size="sm"
            title={t.bannerManagement.preview}
            className="h-9 w-9 p-0"
          >
            <Eye className="h-5 w-5" />
          </Button>
          <Button
            onClick={() => editBanner(banner)}
            variant="outline"
            size="sm"
            title={t.common.edit}
            className="h-9 w-9 p-0"
          >
            <Edit className="h-5 w-5" />
          </Button>
          <Button
            onClick={() => deleteBanner(banner.id)}
            variant="outline"
            size="sm"
            title={t.common.delete}
            className="h-9 w-9 p-0"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      ),
    },
  ];

  const activeBanners = banners.filter(b => b.status === 'active').length;
  const popupBanners = banners.filter(b => b.banner_type === 'popup').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-slate-100">{t.bannerManagement.title}</h1>
          <p className="text-base text-slate-300">
            {t.bannerManagement.subtitle} ({user.level <= 5 ? t.bannerManagement.accessRestricted : t.bannerManagement.accessDenied})
          </p>
        </div>
        {user.level <= 5 && (
          <Button 
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 h-12 px-6 text-base font-bold"
          >
            <Plus className="h-5 w-5" />
            {t.bannerManagement.createNew}
          </Button>
        )}
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title={t.bannerManagement.totalBanners}
          value={banners.length.toLocaleString()}
          subtitle={t.bannerManagement.registered}
          icon={Image}
          color="blue"
        />

        <MetricCard
          title={t.bannerManagement.activeBanners}
          value={activeBanners.toLocaleString()}
          subtitle={t.bannerManagement.displaying}
          icon={Eye}
          color="green"
        />

        <MetricCard
          title={t.bannerManagement.popupBanners}
          value={popupBanners.toLocaleString()}
          subtitle={t.bannerManagement.popupFormat}
          icon={Users}
          color="purple"
        />

        <MetricCard
          title={t.bannerManagement.regularBanners}
          value={(banners.length - popupBanners).toLocaleString()}
          subtitle={t.bannerManagement.bannerFormat}
          icon={Calendar}
          color="orange"
        />
      </div>

      {/* 배너 생성/수정 모달 - 16:9 비율 최적화 */}
      <Dialog open={showForm && user.level <= 5} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="!max-w-[min(1600px,95vw)] w-[95vw] max-h-[85vh] overflow-y-auto glass-card p-0">
          {/* 헤더 - 강조된 디자인 */}
          <DialogHeader className="pb-5 border-b border-slate-700/50 bg-gradient-to-r from-blue-500/10 to-purple-500/10 px-8 pt-6 rounded-t-lg sticky top-0 z-10">
            <DialogTitle className="flex items-center gap-3 text-3xl text-slate-50">
              <div className="p-2.5 bg-blue-500/20 rounded-lg">
                <Image className="h-8 w-8 text-blue-400" />
              </div>
              {editingBanner ? t.bannerManagement.edit : t.bannerManagement.createNew}
            </DialogTitle>
            <DialogDescription className="text-slate-200 mt-2 text-lg">
              {t.bannerManagement.optimizedDescription}
            </DialogDescription>
          </DialogHeader>

          {/* 메인 컨텐츠 - 가로 3컬럼 레이아웃 */}
          <div className="grid grid-cols-12 gap-6 px-8 py-6">
            {/* 왼쪽 - 기본 정보 (4컬럼) */}
            <div className="col-span-4 space-y-4">
              <div className="space-y-4 p-5 border border-slate-700/50 rounded-xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-1 w-8 bg-blue-500 rounded-full"></div>
                  <h4 className="text-lg font-bold text-slate-100">{t.bannerManagement.basicInfo}</h4>
                </div>
                
                <div className="space-y-3">
                  <Label htmlFor="banner_title" className="text-base text-slate-100 flex items-center gap-2 font-semibold">
                    <FileText className="h-4 w-4 text-blue-400" />
                    {t.bannerManagement.bannerTitle} *
                  </Label>
                  <Input
                    id="banner_title"
                    value={bannerForm.title || ''}
                    onChange={(e) => setBannerForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder={t.bannerManagement.titlePlaceholder}
                    className="input-premium h-12 text-base border-slate-600 focus:border-blue-500 bg-slate-800/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-3">
                    <Label className="text-base text-slate-100 font-semibold">{t.bannerManagement.bannerType}</Label>
                    <Select
                      value={bannerForm.banner_type}
                      onValueChange={(value: 'popup' | 'banner') => 
                        setBannerForm(prev => ({ ...prev, banner_type: value }))
                      }
                    >
                      <SelectTrigger className="h-12 text-base bg-slate-800/50 border-slate-600 hover:border-blue-500 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="popup" className="text-base">🔔 {t.bannerManagement.popup}</SelectItem>
                        <SelectItem value="banner" className="text-base">📌 {t.bannerManagement.banner}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base text-slate-100 font-semibold">{t.common.status}</Label>
                    <Select
                      value={bannerForm.status}
                      onValueChange={(value: 'active' | 'inactive') => 
                        setBannerForm(prev => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger className="h-12 text-base bg-slate-800/50 border-slate-600 hover:border-blue-500 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="active" className="text-base">✅ {t.bannerManagement.active}</SelectItem>
                        <SelectItem value="inactive" className="text-base">⏸️ {t.bannerManagement.inactive}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-3">
                    <Label className="text-base text-slate-100 font-semibold">{t.bannerManagement.targetAudience}</Label>
                    <Select
                      value={bannerForm.target_audience}
                      onValueChange={(value: 'all' | 'users' | 'partners') => 
                        setBannerForm(prev => ({ ...prev, target_audience: value }))
                      }
                    >
                      <SelectTrigger className="h-12 text-base bg-slate-800/50 border-slate-600 hover:border-blue-500 transition-colors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="all" className="text-base">👥 All</SelectItem>
                        <SelectItem value="users" className="text-base">👤 Users</SelectItem>
                        <SelectItem value="partners" className="text-base">🤝 Partners</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base text-slate-100 font-semibold">{t.bannerManagement.displayOrder}</Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={bannerForm.display_order || 0}
                      onChange={(e) => setBannerForm(prev => ({ ...prev, display_order: parseInt(e.target.value) }))}
                      placeholder="0"
                      className="input-premium h-12 text-base bg-slate-800/50 border-slate-600 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* 날짜 설정 */}
                <div className="space-y-3 pt-3 border-t border-slate-700/30">
                  <Label className="text-base text-slate-100 flex items-center gap-2 font-semibold">
                    <Calendar className="h-4 w-4 text-blue-400" />
                    {t.bannerManagement.displayPeriod}
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="start_date" className="text-sm text-slate-300">{t.bannerManagement.startDate}</Label>
                      <Input
                        id="start_date"
                        type="datetime-local"
                        value={bannerForm.start_date || ''}
                        onChange={(e) => setBannerForm(prev => ({ ...prev, start_date: e.target.value }))}
                        className="h-11 text-sm bg-slate-800/50 border-slate-600"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_date" className="text-sm text-slate-300">{t.bannerManagement.endDate}</Label>
                      <Input
                        id="end_date"
                        type="datetime-local"
                        value={bannerForm.end_date || ''}
                        onChange={(e) => setBannerForm(prev => ({ ...prev, end_date: e.target.value }))}
                        className="h-11 text-sm bg-slate-800/50 border-slate-600"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 중앙 - 이미지 업로드 (4컬럼) */}
            <div className="col-span-4 space-y-4">
              <div className="space-y-4 p-5 border border-slate-700/50 rounded-xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 shadow-lg h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-8 bg-purple-500 rounded-full"></div>
                    <h4 className="text-lg font-bold text-slate-100">{t.bannerManagement.bannerImage}</h4>
                  </div>
                  {imagePreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleImageRemove}
                      className="h-9 text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <X className="h-4 w-4 mr-1" />
                      {t.bannerManagement.removeImage}
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-sm text-blue-200 flex items-center gap-2 font-medium">
                      <Info className="h-4 w-4" />
                      {t.bannerManagement.recommendedRatio}
                    </p>
                  </div>

                  {!imagePreview ? (
                    <Label 
                      htmlFor="banner_image_upload" 
                      className="flex flex-col items-center justify-center w-full h-[280px] border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-500/5 transition-all bg-slate-800/30 group"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 bg-slate-700/50 rounded-full group-hover:bg-blue-500/20 transition-colors">
                          <Upload className="h-10 w-10 text-slate-400 group-hover:text-blue-400 transition-colors" />
                        </div>
                        <div className="text-center">
                          <p className="text-slate-200 mb-1">
                            <span className="font-semibold">{t.bannerManagement.imageUploadDesc}</span>
                          </p>
                          <p className="text-xs text-slate-400">
                            {t.bannerManagement.dragAndDrop}
                          </p>
                        </div>
                        <div className="px-4 py-2 bg-slate-700/30 rounded-full">
                          <p className="text-xs text-slate-300">
                            {t.bannerManagement.fileFormatInfo}
                          </p>
                        </div>
                      </div>
                      <Input
                        id="banner_image_upload"
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </Label>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative border-2 border-slate-600 rounded-xl overflow-hidden bg-slate-900 shadow-xl">
                        <div className="aspect-video flex items-center justify-center">
                          <img 
                            src={imagePreview} 
                            alt={t.bannerManagement.preview}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="bg-green-500/90 text-white">
                            {t.bannerManagement.preview}
                          </Badge>
                        </div>
                      </div>
                      {selectedImageFile && (
                        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                          <div className="flex items-center gap-2 text-slate-300">
                            <FileText className="h-4 w-4 text-blue-400" />
                            <span className="text-sm truncate max-w-[180px]">{selectedImageFile.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {(selectedImageFile.size / 1024).toFixed(0)} KB
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 오른쪽 - 배너 내용 (4컬럼) */}
            <div className="col-span-4 space-y-4">
              <div className="space-y-4 p-5 border border-slate-700/50 rounded-xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 shadow-lg h-full flex flex-col">
                <div className="flex items-center gap-2">
                  <div className="h-1 w-8 bg-green-500 rounded-full"></div>
                  <h4 className="text-lg font-bold text-slate-100">{t.bannerManagement.bannerContent}</h4>
                </div>
                
                <div className="space-y-3 flex-1 flex flex-col">
                  <Label htmlFor="banner_content" className="text-base text-slate-100 flex items-center gap-2 font-semibold">
                    <FileText className="h-4 w-4 text-green-400" />
                    {t.common.content} *
                  </Label>
                  <Textarea
                    id="banner_content"
                    value={bannerForm.content || ''}
                    onChange={(e) => setBannerForm(prev => ({ ...prev, content: e.target.value }))}
                    placeholder={t.bannerManagement.contentPlaceholder + "\n\n• HTML 태그를 사용할 수 있습니다\n• 줄바꿈은 <br> 태그를 사용하세요\n• 강조는 <strong> 태그를 사용하세요"}
                    className="flex-1 min-h-[320px] bg-slate-800/50 border-slate-600 focus:border-green-500 resize-none text-base leading-relaxed"
                  />
                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <p className="text-sm text-slate-300 leading-relaxed font-medium">
                      💡 <strong className="text-slate-200">{t.bannerManagement.availableTags}:</strong>
                      <br />
                      <span className="text-slate-400">&lt;p&gt; &lt;br&gt; &lt;strong&gt; &lt;em&gt; &lt;span&gt; &lt;div&gt; &lt;a&gt; &lt;ul&gt; &lt;li&gt;</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 하단 버튼 영역 */}
          <div className="sticky bottom-0 flex items-center justify-end gap-3 px-8 py-6 bg-gradient-to-t from-slate-900 to-transparent border-t border-slate-700/50">
            <Button 
              type="button" 
              variant="outline" 
              onClick={resetForm}
              disabled={saving}
              className="min-w-[120px]"
            >
              {t.common.cancel}
            </Button>
            <Button 
              onClick={saveBanner}
              disabled={saving || uploadingImage}
              className="min-w-[140px] bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
            >
              {saving || uploadingImage ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>{t.common.save}...</span>
                </div>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t.common.save}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 배너 목록 테이블 */}
      <div className="glass-card rounded-xl p-6">
        <DataTable
          columns={bannerColumns}
          data={banners}
          searchKey="title"
          loading={loading}
        />
      </div>
    </div>
  );
}

export default BannerManagement;