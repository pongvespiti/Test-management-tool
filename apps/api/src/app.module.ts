import { createRequire } from 'node:module';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { HttpExceptionFilter } from './common/errors/http-exception.filter.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { createValidationPipe } from './common/http/validation.js';
import { CsrfMiddleware } from './common/security/csrf.middleware.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OpenApiModule } from './modules/openapi/openapi.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { CollabModule } from './modules/collab/collab.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { DefectsModule } from './modules/defects/defects.module.js';
import { ExecutionModule } from './modules/execution/execution.module.js';
import { ImportsModule } from './modules/imports/imports.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { LibraryModule } from './modules/library/library.module.js';
import { DevicesModule } from './modules/devices/devices.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { MyWorkModule } from './modules/my-work/my-work.module.js';
import { DimensionsModule } from './modules/dimensions/dimensions.module.js';
import { TopicsModule } from './modules/topics/topics.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { RequirementsModule } from './modules/requirements/requirements.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { TemplatesModule } from './modules/templates/templates.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

/** Feature modules of the domain; each one owns its controllers and services. */
const FEATURE_MODULES = [
  HealthModule,
  AuthModule,
  UsersModule,
  ProjectsModule,
  LibraryModule,
  ImportsModule,
  ExecutionModule,
  TemplatesModule,
  AutomationModule,
  DefectsModule,
  CollabModule,
  IntegrationsModule,
  ReportsModule,
  DashboardModule,
  MyWorkModule,
  DevicesModule,
  NotificationsModule,
  TopicsModule,
  DimensionsModule,
  RequirementsModule,
  SessionsModule,
  OpenApiModule,
];

/**
 * Readable one-line logs in development, when `pino-pretty` (a dev dependency) is installed. A
 * production image has no dev dependencies: there the API logs JSON instead of failing to start.
 */
function prettyLogsAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          genReqId: (req) => {
            const incoming = req.headers['x-request-id'];
            return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
              ? incoming
              : crypto.randomUUID();
          },
          ...(config.nodeEnv === 'development' &&
            prettyLogsAvailable() && {
              transport: { target: 'pino-pretty', options: { singleLine: true } },
            }),
        },
      }),
    }),
    PrismaModule,
    StorageModule,
    ActivityModule,
    ...FEATURE_MODULES,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes('*path');
  }
}
