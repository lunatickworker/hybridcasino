import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../ui/button';
import { toast } from 'sonner@2.0.3';
import { ImageWithFallback } from '../figma/ImageWithFallback';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    const newLang = language === 'ko' ? 'en' : 'ko';
    setLanguage(newLang);
    toast.success(
      newLang === 'ko' 
        ? '한국어로 변경되었습니다' 
        : 'Language changed to English'
    );
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center gap-2 hover:bg-slate-700/50 transition-all hover:scale-105 p-2"
      title={language === 'ko' ? 'Switch to English' : '한국어로 변경'}
    >
      <ImageWithFallback
        src={
          language === 'ko' 
            ? 'https://nzuzzmaiuybzyndptaba.supabase.co/storage/v1/object/public/images/icons8-south-korea-100.png'
            : 'https://nzuzzmaiuybzyndptaba.supabase.co/storage/v1/object/public/images/icons8-usa-100.png'
        }
        alt={language === 'ko' ? 'Korean flag' : 'USA flag'}
        className="w-8 h-8 rounded-md object-cover"
      />
    </Button>
  );
}