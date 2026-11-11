import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/app-config.js';
import { loadEnvFiles } from './config/load-env.js';

loadEnvFiles();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  const config = app.get(AppConfig);
  await app.listen(config.port, config.host);
  app
    .get(Logger)
    .log(`TMT API listening on http://${config.host}:${config.port} (docs: /api/docs)`);
}

await bootstrap();
