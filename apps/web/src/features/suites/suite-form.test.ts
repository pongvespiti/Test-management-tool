import { describe, expect, it } from '@jest/globals';
import { makeSuite } from '@/features/cases/test-utils';
import {
  FIELD_TYPE_OPTIONS,
  fieldRow,
  MAX_LABELS,
  mergeEnvLabels,
  newFieldRow,
  savedFormValues,
  toFormValues,
  toSuiteBody,
  validateSuiteForm,
  type SuiteFormValues,
} from './suite-form';

const suite = makeSuite({
  description: null,
  fieldDefs: [
    { key: 'test_id', label: 'Test ID', type: 'text', showInTable: true },
    { key: 'register', label: 'Register', type: 'select', options: ['40001'], showInTable: false },
  ],
  envTemplate: ['Indoor unit', 'FW version'],
});

describe('suite form model', () => {
  it('turns a suite into form values and back into the request body', () => {
    const values = toFormValues(suite);
    expect(values).toMatchObject({
      name: 'Unit operation test',
      prefix: 'UOT',
      description: '',
      envTemplate: [{ label: 'Indoor unit' }, { label: 'FW version' }],
    });
    expect(values.fieldDefs[0]).toEqual({
      key: 'test_id',
      label: 'Test ID',
      type: 'text',
      options: [],
      showInTable: true,
      isNew: false,
      keyEdited: true,
    });
    values.fieldDefs[0]!.options = ['ignored'];
    values.envTemplate.push({ label: '  Modbus master ' });
    expect(toSuiteBody(values)).toEqual({
      name: 'Unit operation test',
      prefix: 'UOT',
      description: '',
      fieldDefs: [
        { key: 'test_id', label: 'Test ID', type: 'text', options: undefined, showInTable: true },
        {
          key: 'register',
          label: 'Register',
          type: 'select',
          options: ['40001'],
          showInTable: false,
        },
      ],
      envTemplate: ['Indoor unit', 'FW version', 'Modbus master'],
    });
    expect(toFormValues(makeSuite({ description: 'Desc' })).description).toBe('Desc');
  });

  it('creates new rows with a free key and fixes keys after saving', () => {
    expect(newFieldRow([])).toMatchObject({ key: 'field', isNew: true, keyEdited: false });
    expect(newFieldRow(['field']).key).toBe('field_2');
    const values = { ...toFormValues(suite), fieldDefs: [newFieldRow([])] };
    expect(savedFormValues(values).fieldDefs[0]).toMatchObject({ isNew: false, keyEdited: true });
    expect(
      fieldRow({ key: 'a', label: 'A', type: 'longtext', showInTable: false }, true),
    ).toMatchObject({
      isNew: true,
      keyEdited: false,
    });
    expect(FIELD_TYPE_OPTIONS.map((o) => o.value)).toEqual(['text', 'longtext', 'select']);
  });

  it('accepts a valid suite', () => {
    expect(validateSuiteForm(toFormValues(suite))).toEqual({});
  });

  it('reports schema errors by form field', () => {
    const values: SuiteFormValues = {
      ...toFormValues(suite),
      name: ' ',
      prefix: '1A',
      fieldDefs: [{ ...newFieldRow([]), key: 'Bad Key', label: '' }],
      envTemplate: [{ label: 'ok' }, { label: '' }],
    };
    expect(validateSuiteForm(values)).toEqual({
      name: 'Required',
      prefix: '1–10 letters/digits, starting with a letter',
      'fieldDefs.0.key': 'lower-case letters, digits and _, starting with a letter',
      'fieldDefs.0.label': 'Required',
      'envTemplate.1.label': 'Required',
    });
  });

  it('needs options for choice lists and unique keys and labels', () => {
    const values: SuiteFormValues = {
      ...toFormValues(suite),
      fieldDefs: [
        fieldRow({ key: 'a', label: 'A', type: 'select', showInTable: false }),
        fieldRow({ key: 'a', label: 'B', type: 'text', showInTable: false }),
      ],
      envTemplate: [{ label: 'Model' }, { label: ' model ' }, { label: 'FW' }],
    };
    expect(validateSuiteForm(values)).toEqual({
      fieldDefs: 'Field keys must be unique',
      'fieldDefs.0.options': 'Add at least one option',
      'fieldDefs.1.key': 'Another field uses this key',
      envTemplate: 'Environment labels must be unique',
      'envTemplate.1.label': 'Duplicate label',
    });
  });

  it('merges a pasted list of labels', () => {
    expect(mergeEnvLabels([{ label: 'Model' }], ['model', ' FW ', '', 'Master', 'FW'])).toEqual([
      { label: 'Model' },
      { label: 'FW' },
      { label: 'Master' },
    ]);
    const full = Array.from({ length: MAX_LABELS - 1 }, (_, i) => ({ label: `L${i}` }));
    expect(mergeEnvLabels(full, ['x', 'y'])).toHaveLength(MAX_LABELS);
    expect(mergeEnvLabels([...full, { label: 'z' }, { label: 'w' }], ['x'])).toHaveLength(
      MAX_LABELS + 1,
    );
  });
});
