
'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTranslations } from 'next-intl';
import LanguageSwitcher from '../../components/language-switcher';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type U = {
  id: string;
  email: string;
  displayName: string;
};

type C = {
  id: string;
  members: { user: U }[];
  messages: any[];
};

export default function Page() {
  const t = useTranslations();

  const [token, setToken] = useState('');
  const [me, setMe] = useState<U | null>(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [reg, setReg] = useState(false);
  const [status, setStatus] = useState('');
  const [users, setUsers] = useState<U[]>([]);
  const [convs, setConvs] = useState<C[]>([]);
  const [active, setActive] = useState<C | null>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [incoming, setIncoming] = useState<any>(null);
  const [call, setCall] = useState<any>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [unreadConvs, setUnreadConvs] = useState<Set<string>>(new Set());

  const sock = useRef<Socket | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const callRef = useRef<any>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  callRef.current = call;

  const req = async (path: string, method = 'GET', body?: any) => {
    const r = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const d = await r.json();

    if (!r.ok) {
      throw Error(d.message || t('error'));
    }

    return d;
  };

  async function load() {
    const [u, c] = await Promise.all([
      req('/users'),
      req('/conversations'),
    ]);

    setUsers(u);
    setConvs(c);
  }

  // SESSION
  useEffect(() => {
    const savedToken = localStorage.getItem('realtime_chat_token');
    const savedUser = localStorage.getItem('realtime_chat_user');

    if (savedToken) {
      setToken(savedToken);

      if (savedUser) {
        try {
          setMe(JSON.parse(savedUser));
        } catch {
          localStorage.removeItem('realtime_chat_user');
        }
      }
    }
  }, []);

  // SOCKET
  useEffect(() => {
    if (!token) return;

    load().catch((e) => setStatus(e.message));

    const s = io(API + '/realtime', {
      auth: { token },
      transports: ['websocket'],
    });

    sock.current = s;

    s.on('presence:snapshot', (ids: string[]) => {
      setOnlineUsers(new Set(ids));
    });

    s.on(
      'presence:update',
      ({ userId, online }: { userId: string; online: boolean }) => {
        setOnlineUsers((previous) => {
          const next = new Set(previous);

          if (online) next.add(userId);
          else next.delete(userId);

          return next;
        });
      }
    );

    s.on('message:new', (m: any) => {
      if (active?.id === m.conversationId) {
        setMsgs((v) => [...v, m]);
      } else if (m.senderId !== me?.id) {
        setUnreadConvs((previous) => {
          const next = new Set(previous);
          next.add(m.conversationId);
          return next;
        });
      }

      load().catch(() => {});
    });

    s.on('call:incoming', (c: any) => {
      setIncoming(c);
      setStatus(
        t('incomingCall') + ': ' + (c.callerName || t('unknownUser'))
      );
    });

    s.on('call:accepted', () => {
      makePeer(callRef.current, true);
    });

    // WEBRTC SIGNALING
    s.on('call:signal', async ({ signal }: any) => {
      try {
        if (!signal) return;

        // OFFER
        if (signal.type === 'offer') {
          if (!pc.current) {
            await makePeer(callRef.current, false);
          }

          const p = pc.current!;

          await p.setRemoteDescription(
            new RTCSessionDescription(signal)
          );

          for (const candidate of pendingCandidates.current) {
            await p.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }

          pendingCandidates.current = [];

          const answer = await p.createAnswer();
          await p.setLocalDescription(answer);

          sock.current?.emit('call:signal', {
            callId: callRef.current.id,
            signal: p.localDescription,
          });
        }

        // ANSWER
        else if (signal.type === 'answer' && pc.current) {
          await pc.current.setRemoteDescription(
            new RTCSessionDescription(signal)
          );

          for (const candidate of pendingCandidates.current) {
            await pc.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }

          pendingCandidates.current = [];
        }

        // ICE CANDIDATE
        else if (signal.candidate) {
          if (pc.current?.remoteDescription) {
            await pc.current.addIceCandidate(
              new RTCIceCandidate(signal)
            );
          } else {
            pendingCandidates.current.push(signal);
          }
        }
      } catch (err: any) {
        setStatus(
          t('connectionError') + ': ' + (err.message || String(err))
        );
      }
    });

    s.on('call:ended', () => end(false));

    s.on('call:expired', () => {
      setStatus(t('noAnswer'));
      end(false);
    });

    s.on('call:rejected', () => {
      setStatus(t('callRejected'));
      end(false);
    });

    return () => {
      s.disconnect();
      sock.current = null;
    };
  }, [token, active?.id]);

  // MESSAGES
  useEffect(() => {
    if (active && token) {
      req(`/conversations/${active.id}/messages`)
        .then(setMsgs)
        .catch((e) => setStatus(e.message));
    } else {
      setMsgs([]);
    }
  }, [active?.id, token]);

  // AUTH
  async function auth() {
    try {
      if (reg) {
        const d = await req('/auth/register', 'POST', {
          email,
          password: pass,
          displayName: name,
        });

        setStatus(
          d.message || t('registrationSuccess')
        );
      } else {
        const d = await req('/auth/login', 'POST', {
          email,
          password: pass,
        });

        localStorage.setItem('realtime_chat_token', d.accessToken);
        localStorage.setItem(
          'realtime_chat_user',
          JSON.stringify(d.user)
        );

        setToken(d.accessToken);
        setMe(d.user);
        setStatus('');
      }
    } catch (e: any) {
      setStatus(e.message);
    }
  }

  // WEBRTC CORE
  async function makePeer(c: any, initiator: boolean) {
    if (!c) {
      setStatus(t('callNotFound'));
      return;
    }

    try {
      if (pc.current) {
        pc.current.close();
        pc.current = null;
      }

      const cfg = await req('/calls/ice-config');

      const p = new RTCPeerConnection(cfg);
      pc.current = p;

      p.onicecandidate = (e) => {
        if (e.candidate) {
          sock.current?.emit('call:signal', {
            callId: c.id,
            signal: e.candidate.toJSON(),
          });
        }
      };

      p.ontrack = (e) => {
        const remote = remoteVideoRef.current;

        if (remote) {
          const mediaStream =
            e.streams?.[0] || new MediaStream([e.track]);

          remote.srcObject = mediaStream;
          remote.play().catch(() => {});
        }
      };

      p.onconnectionstatechange = () => {
        if (
          p.connectionState === 'failed' ||
          p.connectionState === 'disconnected'
        ) {
          setStatus(t('connectionLost'));
        }

        if (p.connectionState === 'closed') {
          end(false);
        }
      };

      const constraints: MediaStreamConstraints = {
        audio: true,
        video:
          c.type === 'VIDEO'
            ? { facingMode: 'user' }
            : false,
      };

      const mediaStream =
        await navigator.mediaDevices.getUserMedia(constraints);

      stream.current = mediaStream;

      mediaStream.getTracks().forEach((track) => {
        p.addTrack(track, mediaStream);
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      }

      if (initiator) {
        const offer = await p.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: c.type === 'VIDEO',
        });

        await p.setLocalDescription(offer);

        sock.current?.emit('call:signal', {
          callId: c.id,
          signal: p.localDescription,
        });
      }
    } catch (err: any) {
      console.error(err);

      setStatus(
        err.name === 'NotAllowedError'
          ? t('permissionDenied')
          : t('mediaError') + ': ' + (err.message || String(err))
      );

      end(false);
    }
  }

  // CALL ACTIONS
  async function startCall(u: U, type: 'AUDIO' | 'VIDEO') {
    try {
      setStatus(
        type === 'VIDEO'
          ? t('startingVideoCall')
          : t('startingVoiceCall')
      );

      const c = await req('/calls', 'POST', {
        calleeId: u.id,
        type,
      });

      setCall({ ...c, type, role: 'caller' });
      setStatus('');
    } catch (e: any) {
      setStatus(t('callError') + ': ' + e.message);
    }
  }

  function end(emit = true) {
    if (emit && callRef.current) {
      sock.current?.emit('call:end', {
        callId: callRef.current.id,
      });
    }

    if (stream.current) {
      stream.current.getTracks().forEach((track) => track.stop());
      stream.current = null;
    }

    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    pendingCandidates.current = [];

    setCall(null);
    setIncoming(null);
  }

  // AUTH SCREEN
  if (!token) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="user-info" style={{ justifyContent: 'flex-end' }}>
            <LanguageSwitcher />
          </div>

          <div className="logo">{t('appName')}</div>

          <h1>{reg ? t('register') : t('login')}</h1>

          {reg && (
            <input
              placeholder={t('displayName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}

          <input
            placeholder={t('email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            placeholder={t('password')}
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />

          <button className="btn primary full" onClick={auth}>
            {reg ? t('register') : t('login')}
          </button>

          <button
            className="btn ghost full"
            onClick={() => setReg(!reg)}
          >
            {reg ? t('backToLogin') : t('createAccount')}
          </button>

          {status && <p className="status">{status}</p>}
        </div>
      </div>
    );
  }

  // MAIN APP
  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">{t('appName')}</div>

        <div className="user-info">
          <LanguageSwitcher />

          <span>{me?.displayName}</span>

          <button
            className="btn ghost small"
            onClick={() => {
              end(false);

              localStorage.removeItem('realtime_chat_token');
              localStorage.removeItem('realtime_chat_user');

              setToken('');
              setMe(null);
            }}
          >
            {t('logout')}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="section">
            <h3>{t('conversations')}</h3>

            <div className="list">
              {convs.map((c) => {
                const other = c.members?.find(
                  (x) => x.user.id !== me?.id
                )?.user;

                return (
                  <button
                    key={c.id}
                    className={`list-item ${
                      active?.id === c.id ? 'active' : ''
                    }`}
                    onClick={() => {
                      setActive(c);
                      setUnreadConvs((previous) => {
                        const next = new Set(previous);
                        next.delete(c.id);
                        return next;
                      });
                    }}
                  >
                    <div className="avatar">
                      {other?.displayName?.[0] || '?'}
                    </div>

                    <span className="conversation-name">
                      {other?.displayName || t('unknownUser')}
                      {unreadConvs.has(c.id) && (
                        <span className="unread-badge">Yeni</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="section">
            <h3>{t('users')}</h3>

            <div className="list">
              {users
                .filter((u) => u.id !== me?.id)
                .map((u) => (
                  <button
                    key={u.id}
                    className="list-item"
                    onClick={async () => {
                      try {
                        const c = await req('/conversations', 'POST', {
                          otherUserId: u.id,
                        });

                        await load();
                        setActive(c);
                        setUnreadConvs((previous) => {
                          const next = new Set(previous);
                          next.delete(c.id);
                          return next;
                        });
                      } catch (e: any) {
                        setStatus(e.message);
                      }
                    }}
                  >
                    <div
                      className="avatar"
                      style={{ position: 'relative' }}
                    >
                      {u.displayName[0]}

                      <span
                        style={{
                          position: 'absolute',
                          right: 0,
                          bottom: 0,
                          width: 11,
                          height: 11,
                          borderRadius: '50%',
                          background: onlineUsers.has(u.id)
                            ? '#22c55e'
                            : '#9ca3af',
                          border: '2px solid white',
                        }}
                      />
                    </div>

                    <span>
                      {u.displayName}

                      <small
                        style={{
                          display: 'block',
                          fontSize: 11,
                          color: onlineUsers.has(u.id)
                            ? '#16a34a'
                            : '#9ca3af',
                        }}
                      >
                        {onlineUsers.has(u.id)
                          ? t('online')
                          : t('offline')}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </aside>

        <main className="chat">
          {!active ? (
            <div className="inbox">
              <div className="inbox-heading">
                <h2>{t('messages')}</h2>
                <p>Söhbətlərini görmək üçün birini seç.</p>
              </div>

              {convs.length === 0 ? (
                <p className="inbox-empty">Hələ heç bir söhbətin yoxdur.</p>
              ) : (
                <div className="inbox-list">
                  {convs.map((c) => {
                    const other = c.members?.find(
                      (x) => x.user.id !== me?.id
                    )?.user;
                    const isUnread = unreadConvs.has(c.id);

                    return (
                      <button
                        key={c.id}
                        className={`inbox-item ${isUnread ? 'unread' : ''}`}
                        onClick={() => {
                          setActive(c);
                          setUnreadConvs((previous) => {
                            const next = new Set(previous);
                            next.delete(c.id);
                            return next;
                          });
                        }}
                      >
                        <div className="avatar">
                          {other?.displayName?.[0] || '?'}
                        </div>
                        <div className="inbox-item-info">
                          <strong>{other?.displayName || t('unknownUser')}</strong>
                          <small>
                            {isUnread ? 'Yeni mesajın var' : 'Söhbəti aç'}
                          </small>
                        </div>
                        {isUnread && <span className="unread-dot" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="chat-header">
                <div>
                  <h2>
                    {active.members?.find(
                      (x) => x.user.id !== me?.id
                    )?.user.displayName || t('messages')}
                  </h2>

                  {(() => {
                    const otherId = active.members?.find(
                      (x) => x.user.id !== me?.id
                    )?.user.id;

                    return (
                      <small
                        style={{
                          color: onlineUsers.has(otherId || '')
                            ? '#16a34a'
                            : '#9ca3af',
                        }}
                      >
                        {onlineUsers.has(otherId || '')
                          ? `● ${t('online')}`
                          : `● ${t('offline')}`}
                      </small>
                    );
                  })()}
                </div>

                <div className="actions">
                  <button
                    className="btn"
                    onClick={() => {
                      const other = active.members.find(
                        (x) => x.user.id !== me?.id
                      )?.user;
                      if (other) startCall(other, 'AUDIO');
                    }}
                  >
                    {t('voiceCall')}
                  </button>

                  <button
                    className="btn primary"
                    onClick={() => {
                      const other = active.members.find(
                        (x) => x.user.id !== me?.id
                      )?.user;
                      if (other) startCall(other, 'VIDEO');
                    }}
                  >
                    {t('videoCall')}
                  </button>

                  <button
                    className="btn close-chat"
                    title="Mesajlar siyahısına qayıt"
                    aria-label="Söhbəti bağla"
                    onClick={() => {
                      setActive(null);
                      setDraft('');
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="messages">
                {msgs.map((m) => (
                  <div
                    key={m.id}
                    className={`bubble ${
                      m.senderId === me?.id ? 'mine' : ''
                    }`}
                  >
                    {m.body}
                  </div>
                ))}
              </div>

              <div className="composer">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t('typeMessage')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && draft.trim()) {
                      sock.current?.emit('message:send', {
                        conversationId: active.id,
                        body: draft,
                      });
                      setDraft('');
                    }
                  }}
                />

                <button
                  className="btn primary"
                  onClick={() => {
                    if (!draft.trim()) return;
                    sock.current?.emit('message:send', {
                      conversationId: active.id,
                      body: draft,
                    });
                    setDraft('');
                  }}
                >
                  {t('send')}
                </button>
              </div>
            </>
          )}

          {status && <p className="status-bar">{status}</p>}
        </main>
      </div>

      {/* CALL UI */}
      {(incoming || call) && (
        <div className="call-overlay">
          <div className="call-card">
            <h2>
              {incoming
                ? t('incomingCall')
                : call?.role === 'caller'
                  ? t('calling')
                  : t('callActive')}
            </h2>

            {incoming?.callerName && (
              <p className="caller-name">
                {incoming.callerName}
              </p>
            )}

            <div className="videos">
              <video
                ref={remoteVideoRef}
                className="remote"
                autoPlay
                playsInline
              />

              <video
                ref={localVideoRef}
                className="local"
                autoPlay
                muted
                playsInline
              />
            </div>

            <div className="call-actions">
              {incoming ? (
                <>
                  <button
                    className="btn primary large"
                    onClick={() => {
                      setCall({
                        ...incoming,
                        role: 'callee',
                      });

                      setIncoming(null);

                      sock.current?.emit('call:accept', {
                        callId: incoming.id,
                      });
                    }}
                  >
                    {t('accept')}
                  </button>

                  <button
                    className="btn danger large"
                    onClick={() => {
                      sock.current?.emit('call:reject', {
                        callId: incoming.id,
                      });

                      setIncoming(null);
                    }}
                  >
                    {t('reject')}
                  </button>
                </>
              ) : (
                <button
                  className="btn danger large"
                  onClick={() => end()}
                >
                  {t('endCall')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
