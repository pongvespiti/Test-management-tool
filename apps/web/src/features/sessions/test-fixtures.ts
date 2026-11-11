import type { SessionDTO, SessionListItemDTO } from '@tmt/shared';

const T0 = '2026-11-10T09:00:00.000Z';
const alice = { id: 1, username: 'alice', displayName: 'Alice Tester' };

export function makeSessionItem(overrides: Partial<SessionListItemDTO> = {}): SessionListItemDTO {
  return {
    id: 4,
    key: 'EXP-4',
    title: 'Pairing while the router restarts',
    status: 'planned',
    owner: alice,
    release: { id: 5, name: 'FW 2.4.0' },
    build: null,
    references: null,
    timeBoxMinutes: 60,
    startedAt: null,
    endedAt: null,
    noteCount: 0,
    defectCount: 0,
    createdAt: T0,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<SessionDTO> = {}): SessionDTO {
  return {
    ...makeSessionItem(),
    projectId: 3,
    charter: 'Explore pairing with a router that restarts to find lost settings',
    environment: [{ label: 'Platform', value: 'Android' }],
    summary: null,
    createdBy: alice,
    notes: [],
    defects: [],
    ...overrides,
  };
}
