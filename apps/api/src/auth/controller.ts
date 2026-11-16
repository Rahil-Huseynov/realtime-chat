import {
  Body,
  Controller,
  Post,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AuthService } from './service';
import { JwtGuard } from '../common/auth';
import { PrismaService } from '../prisma';

class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  displayName!: string;
}

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

class VerifyDto {
  @IsString()
  token!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private db: PrismaService,
  ) {}

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Req() r: any) {
    return this.db.user.findUnique({
      where: { id: r.user.sub },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    });
  }

  @Post('register')
  register(@Body() b: RegisterDto) {
    return this.auth.register(b.email, b.password, b.displayName);
  }

  @Post('login')
  login(@Body() b: LoginDto) {
    return this.auth.login(b.email, b.password);
  }

  @Post('verify')
  verify(@Body() b: VerifyDto) {
    return this.auth.verify(b.token);
  }
}