import { createContext, useContext, type ReactNode } from 'react';
import type { Language } from '../shared/types';
import { translate } from '../shared/i18n';

const LanguageContext = createContext<Language>('zh-CN');
export function LanguageProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}
export function useLanguage() { return useContext(LanguageContext); }
export function useTranslator(override?: Language) {
  const current = useLanguage();
  return (text: string) => translate(text, override || current);
}
