import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  loginSchema,
  type ChangePasswordInput,
  type LoginInput,
  type MeDTO,
} from '@tmt/shared';
import type { Request, Response } from 'express';
import { AppConfig } from '../../config/app-config.js';
import {
  AllowPendingPasswordChange,
  TechnicianAllowed,
  ApiErrorCodes,
  Public,
  SessionOnly,
} from '../../common/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { LoginRateLimitGuard } from '../../common/security/login-rate-limit.guard.js';
import type { AuthUser } from '../../common/types/auth.js';
import { AuthService } from './auth.service.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  // Per-IP limit from LOGIN_RATE_LIMIT_PER_MIN.
  @UseGuards(LoginRateLimitGuard)
  @ApiErrorCodes('INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'ACCOUNT_DISABLED', 'RATE_LIMITED')
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDTO> {
    const { me, session } = await this.auth.login(body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(this.config.sessionCookieName, session.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      expires: session.expiresAt,
    });
    return me;
  }

  @Public()
  @Post('logout')
  @TechnicianAllowed()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[this.config.sessionCookieName] as string | undefined);
    res.clearCookie(this.config.sessionCookieName, { path: '/' });
  }

  @Get('me')
  @AllowPendingPasswordChange()
  @TechnicianAllowed()
  me(@CurrentUser() user: AuthUser): Promise<MeDTO> {
    return this.auth.me(user.id);
  }

  @Post('change-password')
  @HttpCode(204)
  @TechnicianAllowed()
  @SessionOnly()
  @AllowPendingPasswordChange()
  @ApiErrorCodes('WRONG_PASSWORD', 'SAME_PASSWORD')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body({ schema: changePasswordSchema }) body: ChangePasswordInput,
    @Req() req: Request,
  ): Promise<void> {
    return this.auth.changePassword(user, body, req.sessionId);
  }
}
