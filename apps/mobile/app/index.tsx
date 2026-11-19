import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  PermissionsAndroid,
  StatusBar,
  ActivityIndicator,
  SafeAreaView,
  KeyboardAvoidingView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { requireNativeModule } from 'expo-modules-core';
import { io, Socket } from 'socket.io-client';
import { mediaDevices, RTCPeerConnection, RTCView } from 'react-native-webrtc';
import { useLocale } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

const CallPush = requireNativeModule('CallPush');
const API = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000';

type User = { id: string; email: string; displayName: string };
type Conv = { id: string; members: { user: User }[]; messages: any[] };

export default function Index() {
  const { t, ready } = useLocale();

  const [token, setToken] = useState('');
  const [me, setMe] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [register, setRegister] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState('');

  const [incoming, setIncoming] = useState<any>(null);
  const [call, setCall] = useState<any>(null);
  const [remote, setRemote] = useState('');
  const [local, setLocal] = useState('');

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [unreadConvs, setUnreadConvs] = useState<Set<string>>(new Set());

  const socket = useRef<Socket | null>(null);
  const pc = useRef<any>(null);
  const stream = useRef<any>(null);
  const pending = useRef<any>(null);
  const callRef = useRef<any>(null);
  const iceQueue = useRef<any[]>([]);

  callRef.current = call;

  const request = useCallback(
    async (path: string, method = 'GET', body?: any) => {
      const r = await fetch(`${API}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || t('error'));
      return d;
    },
    [token, t]
  );

  async function registerDevice(tkn: string) {
    try {
      const f = await CallPush.getToken();
      await fetch(`${API}/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tkn}`,
        },
        body: JSON.stringify({ fcmToken: f }),
      });
    } catch (e) {
      console.warn('FCM token register', e);
    }
  }

  // SESSION
  useEffect(() => {
    SecureStore.getItemAsync('accessToken').then(async (saved) => {
      if (saved) {
        setToken(saved);
        try {
          const r = await fetch(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${saved}` },
          });
          if (r.ok) {
            const user = await r.json();
            setMe(user);
            await registerDevice(saved);
          } else {
            await SecureStore.deleteItemAsync('accessToken');
            setToken('');
          }
        } catch {
          // ignore
        }
      }
    });
  }, []);

  // SOCKET
  useEffect(() => {
    if (!token) return;

    load().catch((e) => setStatus(e.message));

    const s = io(`${API}/realtime`, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
    });
    socket.current = s;

    s.on('connect', () => {
      const p = pending.current;
      if (p?.accepted) {
        s.emit('call:accept', { callId: p.callId });
        setCall(p.call);
        callRef.current = p.call;
        pending.current = null;
      } else if (p?.rejected) {
        s.emit('call:reject', { callId: p.callId });
        pending.current = null;
      }
    });

    s.on('presence:snapshot', (ids: string[]) => setOnlineUsers(new Set(ids)));

    s.on('presence:update', ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });

    s.on('message:new', (m: any) => {
      if (active?.id === m.conversationId) {
        setMessages((v) => [...v, m]);
      } else if (m.senderId !== me?.id) {
        setUnreadConvs((prev) => {
          const next = new Set(prev);
          next.add(m.conversationId);
          return next;
        });
      }
      load().catch(() => {});
    });

    s.on('call:incoming', (v: any) => {
      setIncoming(v);
      setStatus(`${t('incomingCall')}: ${v.callerName || t('unknownUser')}`);
    });

    s.on('call:accepted', async ({ callId }: any) => {
      if (callRef.current?.id === callId && callRef.current.role === 'caller') {
        await startPeer(callRef.current, true);
      }
    });

    s.on('call:signal', async ({ signal }: any) => {
      try {
        if (!signal) return;

        if (signal?.type === 'offer') {
          if (!pc.current) await startPeer(callRef.current, false);
          await pc.current.setRemoteDescription(signal);

          for (const c of iceQueue.current) {
            await pc.current.addIceCandidate(c);
          }
          iceQueue.current = [];

          const answer = await pc.current.createAnswer();
          await pc.current.setLocalDescription(answer);
          socket.current?.emit('call:signal', {
            callId: callRef.current.id,
            signal: answer,
          });
        } else if (signal?.type === 'answer' && pc.current) {
          await pc.current.setRemoteDescription(signal);
          for (const c of iceQueue.current) {
            await pc.current.addIceCandidate(c);
          }
          iceQueue.current = [];
        } else if (signal?.candidate) {
          if (pc.current?.remoteDescription) {
            await pc.current.addIceCandidate(signal);
          } else {
            iceQueue.current.push(signal);
          }
        }
      } catch (e) {
        console.warn(e);
      }
    });

    s.on('call:ended', () => finish(false));
    s.on('call:expired', () => {
      setStatus(t('noAnswer'));
      finish(false);
    });
    s.on('call:rejected', () => {
      Alert.alert(t('appName'), t('callRejected'));
      finish(false);
    });

    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, [token, active?.id, me?.id, t]);

  // Messages
  useEffect(() => {
    if (active && token) {
      request(`/conversations/${active.id}/messages`)
        .then(setMessages)
        .catch((e) => setStatus(e.message));
    } else {
      setMessages([]);
    }
  }, [active?.id, token]);

  // Deep link
  useEffect(() => {
    const handle = (url: string) => {
      try {
        const u = new URL(url);
        if (u.hostname === 'call' || u.pathname.startsWith('/call/')) {
          const action = u.pathname.split('/').pop();
          const id = u.searchParams.get('callId');
          if (!id) return;

          if (action === 'accept') {
            pending.current = {
              accepted: true,
              callId: id,
              call: {
                id,
                type: u.searchParams.get('type') || 'AUDIO',
                role: 'callee',
                callerName: u.searchParams.get('caller') || t('incomingCall'),
              },
            };
            setCall(pending.current.call);
            if (socket.current?.connected) {
              socket.current.emit('call:accept', { callId: id });
              pending.current = null;
            }
          } else if (action === 'reject') {
            pending.current = { rejected: true, callId: id };
            if (socket.current?.connected) {
              socket.current.emit('call:reject', { callId: id });
              pending.current = null;
            }
          }
        }
      } catch {
        // ignore
      }
    };

    Linking.getInitialURL().then((u) => u && handle(u));
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [t]);

  async function load() {
    const [u, c] = await Promise.all([request('/users'), request('/conversations')]);
    setUsers(u);
    setConvs(c);
  }

  async function login() {
    try {
      setLoading(true);
      const d = await request('/auth/login', 'POST', { email, password });
      setToken(d.accessToken);
      setMe(d.user);
      await SecureStore.setItemAsync('accessToken', d.accessToken);
      await registerDevice(d.accessToken);
      setStatus('');
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function signup() {
    try {
      setLoading(true);
      const d = await request('/auth/register', 'POST', {
        email,
        password,
        displayName: name,
      });
      setStatus(d.message || t('registrationSuccess'));
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function openChat(user: User) {
    try {
      const c = await request('/conversations', 'POST', { otherUserId: user.id });
      await load();
      setActive(c);
      setMessages([]);
      setUnreadConvs((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
    } catch (e: any) {
      setStatus(e.message);
    }
  }

  function openExistingChat(c: Conv) {
    setActive(c);
    setMessages([]);
    setUnreadConvs((prev) => {
      const next = new Set(prev);
      next.delete(c.id);
      return next;
    });
  }

  async function send() {
    if (!draft.trim() || !active) return;
    socket.current?.emit('message:send', {
      conversationId: active.id,
      body: draft.trim(),
    });
    setDraft('');
  }

  async function startCall(user: User, type: 'AUDIO' | 'VIDEO') {
    try {
      setStatus(type === 'VIDEO' ? t('startingVideoCall') : t('startingVoiceCall'));
      const c = await request('/calls', 'POST', { calleeId: user.id, type });
      const next = { ...c, type, role: 'caller', targetId: user.id };
      callRef.current = next;
      setCall(next);
      setStatus('');
    } catch (e: any) {
      setStatus(`${t('callError')}: ${e.message}`);
    }
  }

  async function startPeer(c: any, initiator: boolean) {
    if (!c) return;

    try {
      const needed =
        c.type === 'VIDEO'
          ? [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, PermissionsAndroid.PERMISSIONS.CAMERA]
          : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];

      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple(needed);
        if (needed.some((p) => granted[p] !== PermissionsAndroid.RESULTS.GRANTED)) {
          throw new Error(t('permissionDenied'));
        }
      }

      const ice = await request('/calls/ice-config');
      const peer = new RTCPeerConnection(ice);
      pc.current = peer;

      peer.onicecandidate = (e: any) => {
        if (e.candidate) {
          socket.current?.emit('call:signal', {
            callId: c.id,
            signal: e.candidate,
          });
        }
      };

      peer.ontrack = (e: any) => {
        const url = e.streams?.[0]?.toURL?.() || '';
        setRemote(url);
      };

      const media = await mediaDevices.getUserMedia({
        audio: true,
        video: c.type === 'VIDEO',
      });
      stream.current = media;
      setLocal(media.toURL());

      await CallPush.startCallService(c.type);

      media.getTracks().forEach((track: any) => peer.addTrack(track, media));

      if (initiator) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.current?.emit('call:signal', {
          callId: c.id,
          signal: offer,
        });
      }
    } catch (e: any) {
      console.warn(e);
      setStatus(e.message || t('mediaError'));
      finish(false);
    }
  }

  async function accept() {
    if (!incoming) return;
    const c = { ...incoming, type: incoming.type, role: 'callee' };
    callRef.current = c;
    setCall(c);
    setIncoming(null);
    socket.current?.emit('call:accept', { callId: c.id });
  }

  function finish(emit = true) {
    if (emit && call) {
      socket.current?.emit('call:end', { callId: call.id });
    }
    stream.current?.getTracks().forEach((t: any) => t.stop());
    CallPush.stopCallService().catch(() => {});
    pc.current?.close();
    pc.current = null;
    iceQueue.current = [];
    stream.current = null;
    setLocal('');
    setRemote('');
    setCall(null);
    setIncoming(null);
  }

  // UI helpers
  const Btn = ({
    label,
    onPress,
    primary = false,
    danger = false,
    small = false,
    style,
  }: {
    label: string;
    onPress: () => void;
    primary?: boolean;
    danger?: boolean;
    small?: boolean;
    style?: any;
  }) => (
    <Pressable
      onPress={onPress}
      style={[s.button, primary && s.primary, danger && s.danger, small && s.buttonSmall, style]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );

  const Avatar = ({ name, online }: { name?: string; online?: boolean }) => (
    <View style={s.avatarWrap}>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{(name || '?')[0]?.toUpperCase()}</Text>
      </View>
      {online !== undefined && (
        <View style={[s.onlineDot, online ? s.online : s.offline]} />
      )}
    </View>
  );

  if (!ready) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator color="#5b7cfa" size="large" />
      </SafeAreaView>
    );
  }

  // AUTH SCREEN
  if (!token) {
    return (
      <SafeAreaView style={s.center}>
        <StatusBar barStyle="light-content" />
        <View style={s.authCard}>
          <View style={{ alignItems: 'flex-end', marginBottom: 12 }}>
            <LanguageSwitcher />
          </View>

          <Text style={s.logo}>{t('appName')}</Text>
          <Text style={s.heading}>{register ? t('register') : t('login')}</Text>

          {register && (
            <TextInput
              style={s.input}
              placeholder={t('displayName')}
              placeholderTextColor="#8b9bb4"
              value={name}
              onChangeText={setName}
            />
          )}
          <TextInput
            style={s.input}
            placeholder={t('email')}
            placeholderTextColor="#8b9bb4"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={s.input}
            placeholder={t('password')}
            placeholderTextColor="#8b9bb4"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Btn
            label={register ? t('register') : t('login')}
            onPress={register ? signup : login}
            primary
            style={{ marginTop: 8 }}
          />
          <Btn
            label={register ? t('backToLogin') : t('createAccount')}
            onPress={() => setRegister(!register)}
            style={{ marginTop: 10 }}
          />

          {loading && <ActivityIndicator color="#5b7cfa" style={{ marginTop: 16 }} />}
          {!!status && <Text style={s.muted}>{status}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  // MAIN APP
  return (
    <SafeAreaView style={s.page}>
      <StatusBar barStyle="light-content" />

      <View style={s.topbar}>
        <Text style={s.logoSmall}>{t('appName')}</Text>
        <View style={s.userInfo}>
          <LanguageSwitcher />
          <Text style={s.muted}>{me?.displayName || '—'}</Text>
          <Btn
            label={t('logout')}
            small
            onPress={async () => {
              finish(false);
              await SecureStore.deleteItemAsync('accessToken');
              setToken('');
              setMe(null);
              setActive(null);
              setUnreadConvs(new Set());
              socket.current?.disconnect();
            }}
          />
        </View>
      </View>

      {active ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.chatHeader}>
            <Btn label="‹" small onPress={() => setActive(null)} style={{ paddingHorizontal: 12 }} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={s.chatTitle} numberOfLines={1}>
                {active.members.find((x) => x.user.id !== me?.id)?.user.displayName || t('messages')}
              </Text>
              {(() => {
                const otherId = active.members.find((x) => x.user.id !== me?.id)?.user.id;
                const isOnline = otherId ? onlineUsers.has(otherId) : false;
                return (
                  <Text style={[s.onlineText, isOnline ? s.onlineColor : s.offlineColor]}>
                    ● {isOnline ? t('online') : t('offline')}
                  </Text>
                );
              })()}
            </View>
            <View style={s.row}>
              <Btn
                label="☎"
                small
                onPress={() => {
                  const u = active.members.find((x) => x.user.id !== me?.id)?.user;
                  if (u) startCall(u, 'AUDIO');
                }}
              />
              <Btn
                label="▣"
                small
                primary
                onPress={() => {
                  const u = active.members.find((x) => x.user.id !== me?.id)?.user;
                  if (u) startCall(u, 'VIDEO');
                }}
                style={{ marginLeft: 6 }}
              />
            </View>
          </View>

          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            data={messages}
            keyExtractor={(x) => x.id}
            renderItem={({ item }) => (
              <View style={[s.bubble, item.senderId === me?.id && s.bubbleMine]}>
                <Text style={s.bubbleText}>{item.body}</Text>
              </View>
            )}
          />

          <View style={s.composer}>
            <TextInput
              style={[s.input, { flex: 1, marginVertical: 0 }]}
              placeholder={t('typeMessage')}
              placeholderTextColor="#8b9bb4"
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <Btn label={t('send')} primary onPress={send} style={{ marginLeft: 8 }} />
          </View>
        </KeyboardAvoidingView>
      ) : (
        <>
          <View style={[s.row, { paddingHorizontal: 16, marginTop: 8 }]}>
            <Btn
              label={t('fullScreenPermission')}
              small
              onPress={async () => {
                const ok = await CallPush.canUseFullScreenIntent();
                if (!ok) await CallPush.openFullScreenIntentSettings();
                else Alert.alert(t('fullScreenActive'), t('fullScreenActiveDesc'));
              }}
            />
          </View>

          <Text style={s.section}>{t('conversations')}</Text>
          <FlatList
            style={{ maxHeight: '38%' }}
            data={convs}
            keyExtractor={(x) => x.id}
            ListEmptyComponent={
              <Text style={[s.muted, { paddingHorizontal: 16 }]}>{t('noConversations')}</Text>
            }
            renderItem={({ item }) => {
              const other = item.members.find((x) => x.user.id !== me?.id)?.user;
              const isOnline = other ? onlineUsers.has(other.id) : false;
              const isUnread = unreadConvs.has(item.id);

              return (
                <Pressable
                  style={[s.listItem, isUnread && s.listItemUnread]}
                  onPress={() => openExistingChat(item)}
                >
                  <Avatar name={other?.displayName} online={isOnline} />
                  <View style={{ flex: 1 }}>
                    <View style={s.rowBetween}>
                      <Text style={s.listTitle}>{other?.displayName || t('unknownUser')}</Text>
                      {isUnread && (
                        <View style={s.unreadBadge}>
                          <Text style={s.unreadBadgeText}>{t('newMessage')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.muted} numberOfLines={1}>
                      {item.messages?.[0]?.body || t('openChat')}
                    </Text>
                  </View>
                  {isUnread && <View style={s.unreadDot} />}
                </Pressable>
              );
            }}
          />

          <Text style={s.section}>{t('users')}</Text>
          <FlatList
            data={users.filter((u) => u.id !== me?.id)}
            keyExtractor={(x) => x.id}
            renderItem={({ item }) => {
              const isOnline = onlineUsers.has(item.id);
              return (
                <Pressable style={s.listItem} onPress={() => openChat(item)}>
                  <Avatar name={item.displayName} online={isOnline} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.listTitle}>{item.displayName}</Text>
                    <Text style={[s.onlineText, isOnline ? s.onlineColor : s.offlineColor]}>
                      {isOnline ? t('online') : t('offline')}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </>
      )}

      {!!status && (
        <Text style={[s.muted, { paddingHorizontal: 16, paddingBottom: 8 }]}>{status}</Text>
      )}

      {/* CALL OVERLAY */}
      {(incoming || call) && (
        <View style={s.overlay}>
          <View style={s.callCard}>
            <Text style={s.heading}>
              {incoming
                ? t('incomingCall')
                : call?.role === 'caller'
                ? t('calling')
                : t('callActive')}
            </Text>
            <Text style={s.muted}>{incoming?.callerName || t('incomingCall')}</Text>

            {remote ? (
              <RTCView streamURL={remote} style={s.video} objectFit="cover" />
            ) : (
              <View style={[s.video, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={s.muted}>…</Text>
              </View>
            )}

            {local ? (
              <RTCView streamURL={local} style={s.videoSmall} objectFit="cover" mirror />
            ) : null}

            <View style={[s.row, { marginTop: 20, gap: 12 }]}>
              {incoming ? (
                <>
                  <Btn label={t('accept')} primary onPress={accept} style={{ minWidth: 120 }} />
                  <Btn
                    label={t('reject')}
                    danger
                    onPress={() => {
                      socket.current?.emit('call:reject', { callId: incoming.id });
                      setIncoming(null);
                    }}
                    style={{ minWidth: 120 }}
                  />
                </>
              ) : (
                <Btn label={t('endCall')} danger onPress={() => finish()} style={{ minWidth: 160 }} />
              )}
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// STYLES (web ilə uyğun dark theme)
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0b0f1a' },
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0b0f1a' },
  authCard: {
    backgroundColor: '#121826',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#2a3548',
  },
  logo: { fontSize: 24, fontWeight: '800', color: '#5b7cfa', marginBottom: 4 },
  logoSmall: { fontSize: 18, fontWeight: '700', color: '#5b7cfa' },
  heading: { fontSize: 22, fontWeight: '700', color: '#e8eef9', marginVertical: 12 },
  muted: { color: '#8b9bb4', marginTop: 8, fontSize: 13 },
  input: {
    backgroundColor: '#1a2234',
    borderColor: '#2a3548',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    color: '#e8eef9',
    marginVertical: 6,
  },
  button: {
    backgroundColor: '#1a2234',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  primary: { backgroundColor: '#5b7cfa' },
  danger: { backgroundColor: '#ef4444' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#121826',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3548',
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: {
    color: '#8b9bb4',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#121826',
    marginHorizontal: 12,
    marginVertical: 3,
    borderRadius: 14,
  },
  listItemUnread: { backgroundColor: '#1a2438' },
  listTitle: { color: '#e8eef9', fontWeight: '600', fontSize: 15 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unreadBadge: {
    backgroundColor: '#5b7cfa',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#5b7cfa' },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#5b7cfa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#121826',
  },
  online: { backgroundColor: '#22c55e' },
  offline: { backgroundColor: '#9ca3af' },
  onlineText: { fontSize: 12, marginTop: 2 },
  onlineColor: { color: '#22c55e' },
  offlineColor: { color: '#9ca3af' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#121826',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3548',
  },
  chatTitle: { color: '#e8eef9', fontSize: 17, fontWeight: '600' },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '78%',
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: '#1a2234',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    marginVertical: 3,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#5b7cfa',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleText: { color: '#fff', fontSize: 15, lineHeight: 20 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#121826',
    borderTopWidth: 1,
    borderTopColor: '#2a3548',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 8, 16, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 100,
  },
  callCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#121826',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a3548',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: 240,
    backgroundColor: '#0d1320',
    borderRadius: 16,
    marginTop: 16,
  },
  videoSmall: {
    width: 110,
    height: 150,
    position: 'absolute',
    right: 28,
    top: 120,
    backgroundColor: '#222',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2a3548',
  },
});