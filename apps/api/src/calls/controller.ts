import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { createHmac } from 'crypto';
import { PrismaService } from '../prisma';
import { JwtGuard } from '../common/auth';
import { ChatGateway } from '../chat/gateway';
import { PushService } from './push';

class CallDto {
  @IsString()
  calleeId!: string;

  @IsIn(['AUDIO', 'VIDEO'])
  type!: string;
}

class DeviceDto {
  @IsString()
  fcmToken!: string;
}

@Controller()
@UseGuards(JwtGuard)
export class CallsController {
  constructor(
    private db: PrismaService,
    private gateway: ChatGateway,
    private push: PushService,
  ) {}

  @Post('calls')
  async create(@Req() r: any, @Body() b: CallDto) {
    if (r.user.sub === b.calleeId) {
      throw new BadRequestException();
    }

    const target = await this.db.user.findFirst({
      where: {
        id: b.calleeId,
        emailVerifiedAt: { not: null },
      },
    });

    if (!target) {
      throw new BadRequestException('İstifadəçi tapılmadı');
    }

    const expiresAt = new Date(Date.now() + 45000);

    const call = await this.db.call.create({
      data: {
        callerId: r.user.sub,
        calleeId: b.calleeId,
        type: b.type,
        expiresAt,
      },
    });

    const caller = await this.db.user.findUniqueOrThrow({
      where: { id: r.user.sub },
      select: { displayName: true },
    });

    const payload = {
      id: call.id,
      callerId: r.user.sub,
      calleeId: b.calleeId,
      callerName: caller.displayName,
      type: b.type,
    };

    this.gateway.emitIncoming(b.calleeId, payload);
    await this.push.incoming(b.calleeId, payload);

    return call;
  }

  @Post('devices')
  async device(@Req() r: any, @Body() b: DeviceDto) {
    if (b.fcmToken.length < 30 || b.fcmToken.length > 4096) {
      throw new BadRequestException('FCM token yanlışdır');
    }

    return this.db.device.upsert({
      where: { fcmToken: b.fcmToken },
      create: {
        fcmToken: b.fcmToken,
        userId: r.user.sub,
      },
      update: {
        userId: r.user.sub,
      },
    });
  }

  @Get('calls/ice-config')
  ice(@Req() r: any) {
    const host = process.env.TURN_HOST;
    const secret = process.env.TURN_SECRET;

    if (!host || !secret) {
      return {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      };
    }

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const username = `${expiry}:${r.user.sub}`;
    const credential = createHmac('sha1', secret)
      .update(username)
      .digest('base64');

    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: [
            `turn:${host}:3478?transport=udp`,
            `turn:${host}:3478?transport=tcp`,
          ],
          username,
          credential,
        },
      ],
    };
  }
}