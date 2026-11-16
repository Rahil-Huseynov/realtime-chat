import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma';
import { JwtGuard } from '../common/auth';

class StartDto {
  @IsString()
  otherUserId!: string;
}

class MessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

@Controller()
@UseGuards(JwtGuard)
export class ChatController {
  constructor(private db: PrismaService) {}

  @Get('users')
  users(@Req() r: any) {
    return this.db.user.findMany({
      where: {
        id: { not: r.user.sub },
        emailVerifiedAt: { not: null },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
      take: 100,
    });
  }

  @Get('conversations')
  conversations(@Req() r: any) {
    return this.db.conversation.findMany({
      where: {
        members: {
          some: { userId: r.user.sub },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, displayName: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Post('conversations')
  async start(@Req() r: any, @Body() b: StartDto) {
    if (r.user.sub === b.otherUserId) {
      throw new BadRequestException();
    }

    const other = await this.db.user.findFirst({
      where: {
        id: b.otherUserId,
        emailVerifiedAt: { not: null },
      },
    });

    if (!other) {
      throw new BadRequestException('İstifadəçi tapılmadı');
    }

    const include = {
      members: {
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    };

    const old = await this.db.conversation.findFirst({
      where: {
        AND: [
          { members: { some: { userId: r.user.sub } } },
          { members: { some: { userId: b.otherUserId } } },
        ],
        members: {
          every: {
            userId: { in: [r.user.sub, b.otherUserId] },
          },
        },
      },
      include,
    });

    if (old) return old;

    return this.db.conversation.create({
      data: {
        members: {
          create: [
            { userId: r.user.sub },
            { userId: b.otherUserId },
          ],
        },
      },
      include,
    });
  }

  @Get('conversations/:id/messages')
  async messages(@Req() r: any, @Param('id') id: string) {
    const ok = await this.db.conversationMember.findFirst({
      where: {
        conversationId: id,
        userId: r.user.sub,
      },
    });

    if (!ok) {
      throw new BadRequestException('Giriş icazəsi yoxdur');
    }

    return this.db.message.findMany({
      where: { conversationId: id },
      include: {
        sender: {
          select: { id: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  @Post('conversations/:id/messages')
  async send(
    @Req() r: any,
    @Param('id') id: string,
    @Body() b: MessageDto,
  ) {
    const ok = await this.db.conversationMember.findFirst({
      where: {
        conversationId: id,
        userId: r.user.sub,
      },
    });

    if (!ok) {
      throw new BadRequestException('Giriş icazəsi yoxdur');
    }

    return this.db.message.create({
      data: {
        conversationId: id,
        senderId: r.user.sub,
        body: b.body.trim(),
      },
    });
  }
}