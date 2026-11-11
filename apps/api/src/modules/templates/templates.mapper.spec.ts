import { describe, expect, it } from '@jest/globals';
import { reportTemplateRow } from '../../../test/unit/fixtures.js';
import {
  BUILT_IN_TEMPLATE,
  builtInTemplateDTO,
  templateConfigOf,
  toTemplateDTO,
} from './templates.mapper.js';

describe('templates mapper', () => {
  it('reads the template config defensively', () => {
    expect(templateConfigOf({ config: { runSheet: 'RUN' } })).toEqual({ runSheet: 'RUN' });
    expect(templateConfigOf({ config: null })).toEqual({});
    expect(templateConfigOf({ config: ['x'] })).toEqual({});
  });

  it('describes the built-in template as id 0', () => {
    expect(builtInTemplateDTO(10, true)).toMatchObject({
      id: 0,
      projectId: 10,
      fileName: BUILT_IN_TEMPLATE.fileName,
      runSheet: 'RUN',
      isDefault: true,
      builtIn: true,
      createdBy: null,
      createdAt: '1970-01-01T00:00:00.000Z',
    });
  });

  it('maps project templates with their file name and run sheet', () => {
    const users = new Map([[1, { id: 1, username: 'lena', displayName: 'Lena' }]]);
    expect(toTemplateDTO(reportTemplateRow({ isDefault: true }), 'team.xlsx', users)).toMatchObject(
      {
        id: 4,
        fileName: 'team.xlsx',
        runSheet: 'RUN',
        isDefault: true,
        builtIn: false,
        createdBy: { id: 1 },
      },
    );
    expect(toTemplateDTO(reportTemplateRow({ config: {} }), 'x.xlsx', users).runSheet).toBeNull();
  });
});
