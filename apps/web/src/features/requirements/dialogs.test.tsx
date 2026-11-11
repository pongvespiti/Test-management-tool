import { describe, expect, it } from '@jest/globals';
import type { RequirementImportAnalysisDTO } from '@tmt/shared';
import { screen, waitFor } from '@testing-library/react';
import { makeProject, renderWithProviders } from '@/test/render';
import { mockApi, openUrl } from '../cases/test-utils';
import { mappingFromAnalysis, missingFields } from './import-dialog';
import { JiraImportDialog } from './jira-dialog';

const analysis = (suggested: (string | null)[]): RequirementImportAnalysisDTO => ({
  uploadId: 'u1',
  fileName: 'req.xlsx',
  sheets: [],
  sheet: 'Sheet1',
  headerRow: 1,
  headerCandidates: [1],
  dataRowCount: 3,
  columns: suggested.map((s, i) => ({
    col: i,
    letter: String.fromCharCode(65 + i),
    header: `H${i}`,
    samples: [],
    suggested: s as 'key' | null,
  })),
});

describe('import mapping', () => {
  it('takes the first column for each suggested field', () => {
    const m = mappingFromAnalysis(analysis(['key', 'title', null, 'key', 'description']));
    expect(m).toEqual({ key: 0, title: 1, description: 4, sourceRef: null });
    expect(missingFields(m)).toEqual([]);
  });

  it('asks for the key and the title when no header looks like them', () => {
    expect(missingFields(mappingFromAnalysis(analysis([null, 'description'])))).toEqual([
      'key',
      'title',
    ]);
  });
});

describe('JiraImportDialog', () => {
  const render = () =>
    renderWithProviders(<JiraImportDialog onClose={() => undefined} />, {
      project: makeProject({ myRole: 'tester' }),
    });

  it('reads issues by key and rejects text that is not a key', async () => {
    openUrl('/projects/3/requirements');
    const api = mockApi({
      'POST /projects/3/requirements/jira/import': { created: 2, updated: 0, missing: [] },
    });
    const { user } = render();
    const read = screen.getByRole('button', { name: 'Read from Jira' });
    expect(read).toBeDisabled();
    await user.type(screen.getByLabelText('Issue keys'), 'iot-12, nonsense');
    expect(screen.getByRole('alert')).toHaveTextContent('nonsense');
    expect(read).toBeDisabled();
    await user.clear(screen.getByLabelText('Issue keys'));
    await user.type(screen.getByLabelText('Issue keys'), 'iot-12 IOT-13');
    await user.click(read);
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/requirements/jira/import')[0]!.body).toEqual({
        keys: ['IOT-12', 'IOT-13'],
      }),
    );
  });

  it('reads issues by JQL', async () => {
    openUrl('/projects/3/requirements');
    const api = mockApi({
      'POST /projects/3/requirements/jira/import': { created: 1, updated: 0, missing: [] },
    });
    const { user } = render();
    await user.click(screen.getByRole('radio', { name: 'JQL search' }));
    await user.type(screen.getByLabelText('JQL search'), 'project = IOT');
    await user.click(screen.getByRole('button', { name: 'Read from Jira' }));
    await waitFor(() =>
      expect(api.find('POST', '/projects/3/requirements/jira/import')[0]!.body).toEqual({
        jql: 'project = IOT',
      }),
    );
  });
});
