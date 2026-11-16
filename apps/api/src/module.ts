import { Module } from '@nestjs/common';
import { PrismaService } from './prisma';
import { AuthController } from './auth/controller';
import { AuthService } from './auth/service';
import { ChatController } from './chat/controller';
import { ChatGateway } from './chat/gateway';
import { CallsController } from './calls/controller';
import { PushService } from './calls/push';
@Module({controllers:[AuthController,ChatController,CallsController],providers:[PrismaService,AuthService,ChatGateway,PushService]}) export class AppModule{}
