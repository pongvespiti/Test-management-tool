import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@tmt/shared';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.js';
import { buildOpenApiDocument } from './modules/openapi/openapi.document.js';
import { OpenApiDocumentHolder } from './modules/openapi/openapi.holder.js';

/** JSON bodies larger than this are rejected (uploads use multipart). */
const JSON_BODY_LIMIT = '2mb';

/**
 * HTTP-level setup shared by `main.ts` and the integration tests: prefix, cookies, security
 * headers, body limits and the OpenAPI document.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.setGlobalPrefix(API_PREFIX.replace(/^\//, ''), {
    exclude: [{ path: 'api/health', method: RequestMethod.GET }],
  });
  app.use(cookieParser());
  app.use(
    helmet({
      // JSON API only; the web app (Next.js) sends its own CSP. Swagger UI needs inline assets.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      strictTransportSecurity: config.cookieSecure ? { maxAge: 15_552_000 } : false,
    }),
  );
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: false });
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = buildOpenApiDocument(app);
    app.get(OpenApiDocumentHolder).set(document);
    SwaggerModule.setup('api/docs', app, document, {
      useGlobalPrefix: false,
      jsonDocumentUrl: 'api/docs/openapi.json',
      swaggerOptions: { withCredentials: true, persistAuthorization: true },
      customSiteTitle: 'TMT API',
    });
  }
}
