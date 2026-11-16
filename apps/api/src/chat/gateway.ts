import { Injectable } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (process.env.WEB_ORIGIN || 'http://localhost:3000').split(','),
  },
})
@Injectable()
export class ChatGateway {
  @WebSocketServer()
  server!: Namespace;

  private users = new Map<string, Set<string>>();

  constructor(private db: PrismaService) {}

  afterInit(server: Namespace) {
    this.server = server;

    this.server.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.data.userId = payload.sub;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });

    this.server.on('connection', (s) => {
      const uid = s.data.userId;

      let sockets = this.users.get(uid);
      if (!sockets) {
        sockets = new Set<string>();
        this.users.set(uid, sockets);
      }
      sockets.add(s.id);

      s.join(`user:${uid}`);

      // Presence snapshot
      s.emit('presence:snapshot', Array.from(this.users.keys()));
      this.server.emit('presence:update', { userId: uid, online: true });

      s.on('disconnect', () => {
        const current = this.users.get(uid);
        if (current) {
          current.delete(s.id);
          if (current.size === 0) {
            this.users.delete(uid);
            this.server.emit('presence:update', { userId: uid, online: false });
          }
        }
      });
    });

    // Call expiry worker
    const expiryWorker = setInterval(async () => {
      try {
        const expired = await this.db.call.findMany({
          where: {
            status: 'RINGING',
            expiresAt: { lte: new Date() },
          },
        });

        if (expired.length) {
          await this.db.call.updateMany({
            where: {
              id: { in: expired.map((c) => c.id) },
              status: 'RINGING',
            },
            data: {
              status: 'EXPIRED',
              endedAt: new Date(),
            },
          });

          for (const c of expired) {
            this.server.to(`user:${c.callerId}`).emit('call:expired', {
              callId: c.id,
            });
          }
        }
      } catch (e) {
        console.error('Call expiry worker failed', e);
      }
    }, 5000);

    expiryWorker.unref?.();
  }

  @SubscribeMessage('message:send')
  async message(
    @ConnectedSocket() s: Socket,
    @MessageBody() b: { conversationId: string; body: string },
  ) {
    const uid = s.data.userId;

    const member = await this.db.conversationMember.findFirst({
      where: {
        conversationId: b.conversationId,
        userId: uid,
      },
    });

    if (!member || !b.body?.trim() || b.body.length > 5000) return;

    const m = await this.db.message.create({
      data: {
        conversationId: b.conversationId,
        senderId: uid,
        body: b.body.trim(),
      },
      include: {
        sender: {
          select: { id: true, displayName: true },
        },
      },
    });

    await this.db.conversation.update({
      where: { id: b.conversationId },
      data: { updatedAt: new Date() },
    });

    const members = await this.db.conversationMember.findMany({
      where: { conversationId: b.conversationId },
    });

    for (const x of members) {
      this.server.to(`user:${x.userId}`).emit('message:new', {
        ...m,
        conversationId: b.conversationId,
      });
    }
  }

  @SubscribeMessage('call:signal')
  async signal(@ConnectedSocket() s: Socket, @MessageBody() b: any) {
    const call = await this.db.call.findUnique({
      where: { id: b.callId },
    });

    if (!call || ![call.callerId, call.calleeId].includes(s.data.userId)) return;

    const target =
      call.callerId === s.data.userId ? call.calleeId : call.callerId;

    this.server.to(`user:${target}`).emit('call:signal', {
      callId: b.callId,
      fromUserId: s.data.userId,
      signal: b.signal,
    });
  }

  @SubscribeMessage('call:accept')
  async accept(@ConnectedSocket() s: Socket, @MessageBody() b: any) {
    const c = await this.db.call.findFirst({
      where: {
        id: b.callId,
        calleeId: s.data.userId,
        status: 'RINGING',
      },
    });

    if (!c) return;

    if (c.expiresAt <= new Date()) {
      await this.db.call.update({
        where: { id: c.id },
        data: { status: 'EXPIRED', endedAt: new Date() },
      });
      this.server.to(`user:${c.callerId}`).emit('call:expired', {
        callId: c.id,
      });
      return;
    }

    await this.db.call.update({
      where: { id: c.id },
      data: { status: 'ACTIVE' },
    });

    this.server.to(`user:${c.callerId}`).emit('call:accepted', {
      callId: c.id,
    });
  }

  @SubscribeMessage('call:reject')
  async reject(@ConnectedSocket() s: Socket, @MessageBody() b: any) {
    const c = await this.db.call.findFirst({
      where: {
        id: b.callId,
        calleeId: s.data.userId,
        status: 'RINGING',
      },
    });

    if (!c) return;

    await this.db.call.update({
      where: { id: c.id },
      data: { status: 'REJECTED', endedAt: new Date() },
    });

    this.server.to(`user:${c.callerId}`).emit('call:rejected', {
      callId: c.id,
    });
  }

  @SubscribeMessage('call:end')
  async end(@ConnectedSocket() s: Socket, @MessageBody() b: any) {
    const c = await this.db.call.findUnique({
      where: { id: b.callId },
    });

    if (!c || ![c.callerId, c.calleeId].includes(s.data.userId)) return;

    await this.db.call.update({
      where: { id: c.id },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    this.server.to(`user:${c.callerId}`).emit('call:ended', { callId: c.id });
    this.server.to(`user:${c.calleeId}`).emit('call:ended', { callId: c.id });
  }

  emitIncoming(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('call:incoming', payload);
  }
}