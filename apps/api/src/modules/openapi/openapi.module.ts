import { Module } from '@nestjs/common';
import { OpenApiController } from './openapi.controller.js';
import { OpenApiDocumentHolder } from './openapi.holder.js';

@Module({
  controllers: [OpenApiController],
  providers: [OpenApiDocumentHolder],
  exports: [OpenApiDocumentHolder],
})
export class OpenApiModule {}
