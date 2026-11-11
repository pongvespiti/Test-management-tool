import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { OpenApiDocumentHolder } from './openapi.holder.js';

/** The OpenAPI document for signed-in users and API clients (`GET /api/v1/openapi.json`). */
@ApiExcludeController()
@Controller()
export class OpenApiController {
  constructor(private readonly holder: OpenApiDocumentHolder) {}

  @Get('openapi.json')
  document(): OpenAPIObject {
    return this.holder.get();
  }
}
