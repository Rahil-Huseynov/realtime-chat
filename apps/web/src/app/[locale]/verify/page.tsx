
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from '../../../components/language-switcher';

export default function Verify() {
  const t = useTranslations();

  const [msg, setMsg] = useState(t('verifyingEmail'));

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');

    if (!token) {
      setMsg(t('tokenNotFound'));
      return;
    }

    fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      }
    )
      .then(async (r) => {
        const d = await r.json();

        if (!r.ok) {
          throw Error(d.message || t('verifyFailed'));
        }

        setMsg(t('verifySuccess'));
      })
      .catch((e) => {
        setMsg(e.message || t('verifyFailed'));
      });
  }, []);

  return (
    <main
      style={{
        maxWidth: 520,
        margin: '15vh auto',
        padding: 32,
        background: '#121826',
        borderRadius: 18,
        border: '1px solid #2a3548',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <LanguageSwitcher />
      </div>

      <h1 style={{ marginTop: 0 }}>{t('appName')}</h1>

      <p>{msg}</p>

      <a
        href="/"
        style={{ color: '#5b7cfa' }}
      >
        {t('backToLogin')}
      </a>
    </main>
  );
}
