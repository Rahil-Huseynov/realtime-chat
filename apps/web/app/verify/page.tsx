'use client';

import { useEffect, useState } from 'react';

export default function Verify() {
  const [msg, setMsg] = useState('E-poçt təsdiqlənir...');

  useEffect(() => {
    const t = new URLSearchParams(location.search).get('token');
    if (!t) {
      setMsg('Təsdiq tokeni tapılmadı');
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.message || 'Təsdiq alınmadı');
        setMsg('E-poçt uğurla təsdiqləndi. İndi tətbiqə qayıdıb daxil ola bilərsiniz.');
      })
      .catch((e) => setMsg(e.message));
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
      <h1 style={{ marginTop: 0 }}>Realtime Chat</h1>
      <p>{msg}</p>
      <a href="/" style={{ color: '#5b7cfa' }}>
        Giriş səhifəsinə qayıt
      </a>
    </main>
  );
}