import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createUserSchema,
  lookupUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
  type UserDTO,
  type UserRef,
} from '@tmt/shared';
import type { z } from 'zod';
import { AdminOnly, ApiErrorCodes, SessionOnly } from '../../common/decorators/auth.decorators.js';
import { CurrentUser } from '../../common/decorators/request.decorators.js';
import { ID } from '../../common/http/params.js';
import type { AuthUser } from '../../common/types/auth.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @AdminOnly()
  list(): Promise<UserDTO[]> {
    return this.users.list();
  }

  /** Active users for pickers (any signed-in user). */
  @Get('lookup')
  lookup(
    @Query({ schema: lookupUsersQuerySchema }) q: z.infer<typeof lookupUsersQuerySchema>,
  ): Promise<UserRef[]> {
    return this.users.lookup(q.q);
  }

  @Post()
  @AdminOnly()
  @SessionOnly()
  @ApiErrorCodes('USERNAME_TAKEN')
  create(
    @CurrentUser() me: AuthUser,
    @Body({ schema: createUserSchema }) body: CreateUserInput,
  ): Promise<UserDTO> {
    return this.users.create(me, body);
  }

  @Patch(':userId')
  @AdminOnly()
  @SessionOnly()
  @ApiErrorCodes('USER_NOT_FOUND', 'CANNOT_MODIFY_SELF')
  update(
    @CurrentUser() me: AuthUser,
    @Param('userId', ID) userId: number,
    @Body({ schema: updateUserSchema }) body: UpdateUserInput,
  ): Promise<UserDTO> {
    return this.users.update(me, userId, body);
  }

  @Post(':userId/reset-password')
  @HttpCode(204)
  @AdminOnly()
  @SessionOnly()
  @ApiErrorCodes('USER_NOT_FOUND')
  resetPassword(
    @CurrentUser() me: AuthUser,
    @Param('userId', ID) userId: number,
    @Body({ schema: resetPasswordSchema }) body: ResetPasswordInput,
  ): Promise<void> {
    return this.users.resetPassword(me, userId, body);
  }

  @Delete(':userId/tokens')
  @HttpCode(204)
  @AdminOnly()
  @SessionOnly()
  @ApiErrorCodes('USER_NOT_FOUND')
  revokeTokens(@CurrentUser() me: AuthUser, @Param('userId', ID) userId: number): Promise<void> {
    return this.users.revokeTokens(me, userId);
  }
}
