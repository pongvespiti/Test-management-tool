import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/auth.decorators.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export const API_VERSION = process.env.npm_package_version ?? '2.0.0';

/** Liveness/readiness for load balancers and Docker health checks (`/api/health`). */
@ApiTags('Health')
@Controller('api/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @HttpCode(200)
  async health(@Res({ passthrough: true }) res: Response) {
    let db: 'ok' | 'down' = 'ok';
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
      res.status(503);
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', db, version: API_VERSION };
  }
}
