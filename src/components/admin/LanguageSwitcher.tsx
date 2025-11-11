import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../ui/button';
import { Globe } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

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
      className="flex items-center gap-2 hover:bg-slate-700/50 text-slate-200 hover:text-white transition-colors"
    >
      <Globe className="w-4 h-4" />
      <span className="text-2xl leading-none">
        {language === 'ko' ? '🇰🇷' : '🇺🇸'}
      </span>
      <span className="text-sm font-medium">
        {language === 'ko' ? 'KO' : 'EN'}
      </span>
    </Button>
  );
}
