import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { translations, Locale, TranslationKey } from './translations';

const LOCALE_KEY = 'realtime_chat_locale';

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>('az');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(LOCALE_KEY).then((saved) => {
      if (saved === 'az' || saved === 'en' || saved === 'ru') {
        setLocaleState(saved);
      }
      setReady(true);
    });
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await SecureStore.setItemAsync(LOCALE_KEY, next);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => {
      return translations[locale][key] ?? translations.az[key] ?? key;
    },
    [locale]
  );

  return { locale, setLocale, t, ready };
}