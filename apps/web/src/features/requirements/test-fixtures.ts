import type { RequirementDTO, RequirementListItemDTO } from '@tmt/shared';

const T0 = '2026-11-10T09:00:00.000Z';
const alice = { id: 1, username: 'alice', displayName: 'Alice Tester' };

export function makeRequirementItem(
  overrides: Partial<RequirementListItemDTO> = {},
): RequirementListItemDTO {
  return {
    id: 21,
    key: 'REQ-1',
    title: 'Unit powers on within 3 s',
    source: 'manual',
    sourceRef: null,
    externalUrl: null,
    externalStatus: null,
    syncedAt: null,
    caseCount: 2,
    needsReview: false,
    textChangedAt: null,
    updatedAt: T0,
    ...overrides,
  };
}

export function makeRequirement(overrides: Partial<RequirementDTO> = {}): RequirementDTO {
  return {
    ...makeRequirementItem(),
    projectId: 3,
    description: 'From plug-in to the ready tone in at most 3 seconds.',
    cases: [
      {
        id: 11,
        displayId: 'UO-001',
        title: 'Power on',
        suite: { id: 1, name: 'Unit operation test' },
        via: 'linked',
      },
      {
        id: 12,
        displayId: 'UO-002',
        title: 'Power off',
        suite: { id: 1, name: 'Unit operation test' },
        via: 'refs',
      },
    ],
    createdBy: alice,
    createdAt: T0,
    ...overrides,
  };
}
