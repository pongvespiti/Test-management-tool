import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Body, Controller, Module, Post, UploadedFile } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { unitConfig } from '../../../test/unit/fixtures.js';
import { HttpExceptionFilter } from '../../common/errors/http-exception.filter.js';
import { AppConfig } from '../../config/app-config.js';
import { ConfigModule } from '../../config/config.module.js';
import { FileUpload } from './upload.decorator.js';
import { StorageModule } from './storage.module.js';
import { StorageService } from './storage.service.js';
import { UploadService, type MultipartFile } from './upload.service.js';

@Controller('upload')
class UploadTestController {
  constructor(private readonly uploads: UploadService) {}

  @Post()
  @FileUpload({ note: { type: 'string' } })
  async upload(@UploadedFile() file: MultipartFile | undefined, @Body() body: { note?: string }) {
    const saved = await this.uploads.store(file, { allowExtensions: new Set(['png', 'xlsx']) });
    return { ...saved, note: body.note ?? null };
  }
}

@Module({ controllers: [UploadTestController] })
class UploadTestModule {}

describe('file uploads (@FileUpload + UploadService)', () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tmt-upload-'));
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, StorageModule, UploadTestModule],
    })
      .overrideProvider(AppConfig)
      .useValue(unitConfig({ DATA_DIR: dir, MAX_UPLOAD_MB: '0.01' }))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('stores the file with a UTF-8 name and returns the text fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/upload')
      .field('note', 'evidence')
      .attach('file', Buffer.from('PNG data'), 'หน้าจอ 1.png');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      fileName: 'หน้าจอ 1.png',
      mimeType: 'image/png',
      note: 'evidence',
    });
    const stored = await app.get(StorageService).readBuffer(res.body.stored.storageKey);
    expect(stored.toString()).toBe('PNG data');
  });

  it('rejects missing, empty, too large and unsupported files with stable codes', async () => {
    const server = app.getHttpServer();
    expect((await request(server).post('/upload').field('note', 'x')).body.error.code).toBe(
      'FILE_REQUIRED',
    );
    expect(
      (await request(server).post('/upload').attach('file', Buffer.alloc(0), 'a.png')).body.error
        .code,
    ).toBe('EMPTY_FILE');
    const big = await request(server).post('/upload').attach('file', Buffer.alloc(20_000), 'a.png');
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');
    const exe = await request(server).post('/upload').attach('file', Buffer.from('x'), 'tool.exe');
    expect(exe.status).toBe(415);
    expect(exe.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    const txt = await request(server).post('/upload').attach('file', Buffer.from('x'), 'notes.txt');
    expect(txt.body.error).toEqual({
      code: 'UNSUPPORTED_FILE_TYPE',
      message: 'Files of type .txt cannot be uploaded',
    });
  });
});
