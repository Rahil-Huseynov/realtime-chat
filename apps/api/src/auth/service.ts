import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma';

@Injectable()
export class AuthService {
  constructor(private db: PrismaService) {}

  private sign(user: { id: string; email: string; displayName: string }) {
    return jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' },
    );
  }

  async register(email: string, password: string, displayName: string) {
    const exists = await this.db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (exists) {
      throw new BadRequestException('Bu e-poçt artıq qeydiyyatdan keçib');
    }

    const token = randomBytes(32).toString('hex');

    const user = await this.db.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
        displayName,
        verificationToken: token,
      },
    });

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 1025),
      secure: false,
    });

    const url = `${process.env.APP_URL || 'http://localhost:3000'}/az/verify?token=${token}`;

    await transport.sendMail({
      from: process.env.MAIL_FROM || 'Realtime Chat <noreply@example.test>',
      to: user.email,
      subject: 'E-poçt ünvanını təsdiqlə',
      html: `
        <p>Salam ${displayName},</p>
        <p>Hesabını təsdiqləmək üçün <a href="${url}">buraya klik et</a>.</p>
      `,
    });

    return { message: 'Təsdiq linki e-poçt ünvanınıza göndərildi' };
  }

  async verify(token: string) {
    const user = await this.db.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Təsdiq tokeni yanlışdır və ya bitib');
    }

    await this.db.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        verificationToken: null,
      },
    });

    return { verified: true };
  }

  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('E-poçt və ya şifrə yanlışdır');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Əvvəlcə e-poçt ünvanınızı təsdiqləyin');
    }

    return {
      accessToken: this.sign(user),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    };
  }
}