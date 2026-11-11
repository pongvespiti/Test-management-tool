import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createTokenSchema,
  type ApiTokenDTO,
  type CreatedTokenDTO,
  type CreateTokenInput,
} from '@tmt/shared';
import { ApiErrorCodes, SessionOnly } from '../../common/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser } from '../../common/types/auth.js';
import { ApiTokenService } from './api-token.service.js';

/** The caller's personal API tokens (session only: a token cannot mint more tokens). */
@ApiTags('API tokens')
@Controller('auth/tokens')
@SessionOnly()
export class TokensController {
  constructor(private readonly tokens: ApiTokenService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ApiTokenDTO[]> {
    return this.tokens.list(user.id);
  }

  @Post()
  @ApiErrorCodes('TOO_MANY_TOKENS')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTokenSchema }) body: CreateTokenInput,
  ): Promise<CreatedTokenDTO> {
    return this.tokens.create(user.id, body);
  }

  @Delete(':tokenId')
  @HttpCode(204)
  @ApiErrorCodes('TOKEN_NOT_FOUND')
  revoke(@CurrentUser() user: AuthUser, @Param('tokenId', ID) tokenId: number): Promise<void> {
    return this.tokens.revoke(user.id, tokenId);
  }
}
