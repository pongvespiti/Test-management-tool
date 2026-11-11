import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { notFound } from '../../common/errors/app.exception.js';

/** Keeps the document built once at start-up (see `configureApp`). */
@Injectable()
export class OpenApiDocumentHolder {
  private document: OpenAPIObject | null = null;

  set(document: OpenAPIObject): void {
    this.document = document;
  }

  get(): OpenAPIObject {
    if (!this.document) throw notFound('API documentation', 'OPENAPI_DISABLED');
    return this.document;
  }
}
