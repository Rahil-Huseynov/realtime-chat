'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '../i18n/navigation';

const languages = [
  { code: 'az', label: 'AZ', name: 'Azərbaycan' },
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'ru', label: 'RU', name: 'Русский' },
] as const;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function changeLanguage(nextLocale: 'az' | 'en' | 'ru') {
    if (nextLocale === locale) return;

    localStorage.setItem('realtime_chat_locale', nextLocale);

    router.replace(pathname, {
      locale: nextLocale,
    } as Parameters<typeof router.replace>[1]);
  }

  return (
    <div className="language-switcher" role="group" aria-label="Language">
      {languages.map((language) => {
        const isActive = locale === language.code;

        return (
          <button
            key={language.code}
            type="button"
            className={`lang-btn ${isActive ? 'active' : ''}`}
            onClick={() => changeLanguage(language.code)}
            aria-label={`Switch language to ${language.name}`}
            aria-pressed={isActive}
            title={language.name}
          >
            <span className="lang-label">{language.label}</span>
            {isActive && <span className="lang-indicator" />}
          </button>
        );
      })}
    </div>
  );
}