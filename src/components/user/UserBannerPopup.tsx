import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { useLanguage } from "../../contexts/LanguageContext";

interface Banner {
  id: string;
  title: string;
  content: string;
  image_url?: string;
  display_order: number;
}

interface UserBannerPopupProps {
  userId: string;
}

export function UserBannerPopup({ userId }: UserBannerPopupProps) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (userId) {
      console.log('🎯 [배너 팝업] 사용자 ID:', userId);
      loadActiveBanners();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadActiveBanners = async () => {
    try {
      console.log('🔍 [배너 팝업] 배너 로드 시작');
      
      // 병렬로 처리하여 속도 개선
      const [timezoneResult, userResult] = await Promise.all([
        // 1. 시스템 시간대 설정 조회
        supabase
          .from('system_settings')
          .select('setting_value')
          .eq('setting_key', 'timezone_offset')
          .single(),
        // 2. 사용자 정보 조회 (referrer_id)
        supabase
          .from('users')
          .select('referrer_id')
          .eq('id', userId)
          .single()
      ]);

      const timezoneOffset = timezoneResult.data?.setting_value 
        ? parseInt(timezoneResult.data.setting_value) 
        : 9; // 기본값 UTC+9

      if (userResult.error || !userResult.data?.referrer_id) {
        console.error('❌ [배너 팝업] 사용자 정보 조회 실패:', userResult.error);
        return;
      }

      console.log('👤 [배너 팝업] Referrer ID:', userResult.data.referrer_id);

      // 3. referrer의 partner_id 찾기 & 배너 조회 (병렬 처리하지 않음 - partner_id가 필요)
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('id', userResult.data.referrer_id)
        .single();

      if (partnerError || !partnerData) {
        console.error('❌ [배너 팝업] 파트너 정보 조회 실패:', partnerError);
        return;
      }

      console.log('🤝 [배너 팝업] Partner ID:', partnerData.id);

      // 4. 활성화된 팝업 배너 조회 (해당 파트너의 배너만)
      const { data, error } = await supabase
        .from('banners')
        .select('id, title, content, image_url, display_order, start_date, end_date')
        .eq('partner_id', partnerData.id)
        .eq('banner_type', 'popup')
        .eq('status', 'active')
        .in('target_audience', ['all', 'users'])
        .order('display_order', { ascending: true });

      if (error) {
        console.error('❌ [배너 팝업] 배너 로드 실패:', error);
        return;
      }

      console.log('📋 [배너 팝업] 조회된 배너 개수:', data?.length || 0);

      // 날짜 필터링 (클라이언트 측에서)
      const activeBanners = data?.filter(banner => {
        // DB에 저장된 날짜는 ISO 8601 형식 (예: "2025-11-14T16:20:00+09:00")
        const now = new Date(); // 현재 UTC 시간
        const startOk = !banner.start_date || new Date(banner.start_date) <= now;
        const endOk = !banner.end_date || new Date(banner.end_date) >= now;
        console.log(`  - ${banner.title}:`);
        console.log(`    시작일: ${banner.start_date || '없음'} → ${startOk ? '✅' : '❌'}`);
        console.log(`    종료일: ${banner.end_date || '없음'} → ${endOk ? '✅' : '❌'}`);
        console.log(`    현재: ${now.toISOString()}`);
        return startOk && endOk;
      }) || [];

      console.log('✅ [배너 팝업] 활성 배너 개수:', activeBanners.length);

      if (activeBanners.length > 0) {
        // 오늘 이미 본 배너들을 체크 (배너별로 관리)
        const today = new Date().toDateString();
        const notViewedBanners = activeBanners.filter(banner => {
          const storageKey = `banner_viewed_${banner.id}_${today}`;
          const viewedToday = localStorage.getItem(storageKey);
          console.log(`💾 [배너 팝업] ${banner.title} (ID: ${banner.id}): ${viewedToday ? '이미 봄' : '아직 안 봄'}`);
          return !viewedToday;
        });
        
        if (notViewedBanners.length > 0) {
          console.log('✨ [배너 팝업] 팝업 표시!', notViewedBanners.length, '개');
          setBanners(notViewedBanners);
          setIsVisible(true);
        } else {
          console.log('⏭️ [배너 팝업] 모든 배너를 오늘 이미 봄, 팝업 스킵');
        }
      } else {
        console.log('⚠️ [배너 팝업] 표시할 배너 없음');
      }
    } catch (error) {
      console.error('❌ [배너 팝업] 오류:', error);
    }
  };

  // X 버튼 클릭 시 - 그냥 닫기만 (localStorage 저장 안 함)
  const handleDismiss = () => {
    console.log('❌ [배너 팝업] X 버튼 클릭 - 그냥 닫기');
    setIsVisible(false);
  };

  // "오늘은 그만 열기" 클릭 시 - localStorage에 저장
  const handleDontShowToday = () => {
    console.log('🚪 [배너 팝업] 오늘은 그만 열기');
    setIsVisible(false);
    
    // 현재 표시 중인 배너 ID로 저장
    const today = new Date().toDateString();
    const currentBanner = banners[currentBannerIndex];
    if (currentBanner) {
      const storageKey = `banner_viewed_${currentBanner.id}_${today}`;
      localStorage.setItem(storageKey, 'true');
      console.log('💾 [배너 팝업] 로컬스토리지 저장:', storageKey);
    }
  };

  const handleNext = () => {
    if (currentBannerIndex < banners.length - 1) {
      setCurrentBannerIndex(prev => prev + 1);
    } else {
      handleDismiss();
    }
  };

  const handlePrev = () => {
    if (currentBannerIndex > 0) {
      setCurrentBannerIndex(prev => prev - 1);
    }
  };

  if (!isVisible || banners.length === 0) {
    return null;
  }

  const currentBanner = banners[currentBannerIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center animate-in zoom-in-95 duration-200"
      >
        {/* 닫기 버튼 - 더 크고 명확하게 */}
        <Button
          onClick={handleDismiss}
          variant="ghost"
          size="sm"
          className="absolute -top-12 right-0 z-10 h-12 w-12 p-0 rounded-full bg-white/90 hover:bg-white text-black hover:text-black shadow-lg hover:shadow-xl transition-all"
        >
          <X className="h-6 w-6" />
        </Button>

        {/* 배너 이미지 */}
        {currentBanner.image_url ? (
          <div className="relative flex flex-col items-center gap-4">
            <img
              src={currentBanner.image_url}
              alt={currentBanner.title}
              className="w-full h-auto object-contain rounded-lg shadow-2xl"
              style={{ maxHeight: 'calc(90vh - 60px)', maxWidth: '90vw' }}
            />
            
            {/* 하단 "오늘은 그만보기" - 이미지 외부 배치 */}
            <button
              onClick={handleDontShowToday}
              className="text-sm text-white hover:text-white bg-slate-800/90 hover:bg-slate-700/90 px-6 py-3 rounded-full transition-all backdrop-blur-sm border border-white/20 shadow-lg hover:shadow-xl hover:scale-105"
            >
              {t.user.dontShowToday}
            </button>
          </div>
        ) : (
          // 이미지가 없는 경우 (텍스트만)
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-orange-500/50 rounded-2xl shadow-2xl p-8 min-w-[400px]">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-orange-500 mb-2">
                {currentBanner.title}
              </h2>
            </div>

            {currentBanner.content && (
              <div
                className="text-slate-200 leading-relaxed mb-6 prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: currentBanner.content }}
              />
            )}

            <div className="flex flex-col gap-3 pt-4 border-t border-slate-700">
              <Button
                onClick={handleDismiss}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
              >
                확인
              </Button>
              
              <button
                onClick={handleDontShowToday}
                className="text-xs text-slate-300 hover:text-white px-4 py-2 rounded-lg hover:bg-slate-700/50 transition-all"
              >
                {t.user.dontShowToday}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserBannerPopup;