import React, { createContext, useContext, useState, useEffect } from 'react';
import { ko } from '../translations/ko';
import { en } from '../translations/en';

// v2.2 - Silent fallback for components rendered outside LanguageProvider
type Language = 'ko' | 'en';
type Translations = typeof ko;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  formatCurrency: (amount: number) => string; // ✅ 통화 포맷팅 함수 추가
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('admin_language');
    return (saved === 'en' ? 'en' : 'ko') as Language;
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('admin_language', lang);
  };

  const t = language === 'en' ? en : ko;

  // ✅ 통화 포맷팅 함수
  const formatCurrency = (amount: number): string => {
    const currencySymbol = t.common.currency;
    return `${currencySymbol}${amount.toLocaleString()}`;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, formatCurrency }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    // Silent fallback when LanguageProvider is not available
    return {
      language: 'ko' as Language,
      setLanguage: () => {},
      t: ko,
      formatCurrency: (amount: number) => `₩${amount.toLocaleString()}`
    };
  }
  return context;
}