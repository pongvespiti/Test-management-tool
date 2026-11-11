import { Global, Module } from '@nestjs/common';
import { ApiTokenService } from './api-token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { InitialAdminService } from './initial-admin.service.js';
import { SessionService } from './session.service.js';
import { TokensController } from './tokens.controller.js';

@Global()
@Module({
  controllers: [AuthController, TokensController],
  providers: [AuthService, SessionService, ApiTokenService, InitialAdminService],
  exports: [SessionService, ApiTokenService],
})
export class AuthModule {}
