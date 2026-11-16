import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma';

@Injectable()
export class PushService {
  private log = new Logger(PushService.name);

  constructor(private db: PrismaService) {
    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY &&
      !admin.apps.length
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(
            /\\n/g,
            '\n',
          ),
        }),
      });
    }
  }

  async incoming(userId: string, call: any) {
    const devices = await this.db.device.findMany({
      where: { userId },
    });

    if (!devices.length) return;

    if (!admin.apps.length) {
      this.log.warn('Firebase credentials are not configured');
      return;
    }

    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens: devices.map((x) => x.fcmToken),
        data: {
          kind: 'INCOMING_CALL',
          callId: call.id,
          callerId: call.callerId,
          callerName: call.callerName,
          callType: call.type,
          expiresAt: String(Date.now() + 45000),
        },
        android: {
          priority: 'high',
          ttl: 45000,
          collapseKey: `call-${call.id}`,
        },
      });

      const bad = res.responses
        .map((x, i) => (!x.success ? devices[i].fcmToken : null))
        .filter(Boolean) as string[];

      if (bad.length) {
        await this.db.device.deleteMany({
          where: { fcmToken: { in: bad } },
        });
      }
    } catch (e) {
      this.log.error('FCM incoming call push failed', e as Error);
    }
  }
}