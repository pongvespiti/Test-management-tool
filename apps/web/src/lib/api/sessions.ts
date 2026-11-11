import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddSessionNoteInput,
  CreateSessionInput,
  ListSessionsQuery,
  SessionDTO,
  SessionListItemDTO,
  SessionNoteDTO,
  UpdateSessionInput,
} from '@tmt/shared';
import { api } from './client';
import { exceptUnder, qk } from './keys';

type Input<T> = { [K in keyof T]?: T[K] };

const base = (projectId: number) => `/projects/${projectId}/sessions`;

/** Exploratory sessions of a project, newest first (optionally by status, release or owner). */
export function useSessions(projectId: number, params: ListSessionsQuery = {}) {
  return useQuery({
    queryKey: qk.sessionList(projectId, params),
    queryFn: () =>
      api.get<SessionListItemDTO[]>(base(projectId), {
        status: params.status,
        releaseId: params.releaseId,
        ownerId: params.ownerId,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useSession(projectId: number, sessionId: number | null) {
  return useQuery({
    queryKey: qk.session(projectId, sessionId ?? 0),
    queryFn: () => api.get<SessionDTO>(`${base(projectId)}/${sessionId}`),
    enabled: sessionId !== null && sessionId > 0,
  });
}

/** Mutations keep the open session in the cache and refresh the lists (counts, status). */
function useSessionMutations(projectId: number) {
  const qc = useQueryClient();
  const store = (saved: SessionDTO) => {
    qc.setQueryData(qk.session(projectId, saved.id), saved);
    void qc.invalidateQueries({ queryKey: [...qk.sessions(projectId), 'list'] });
    void qc.invalidateQueries({ queryKey: ['activity', projectId] });
  };
  return { qc, store };
}

export function useCreateSession(projectId: number) {
  const { store } = useSessionMutations(projectId);
  return useMutation({
    mutationFn: (body: Input<CreateSessionInput> & { title: string }) =>
      api.post<SessionDTO>(base(projectId), body),
    onSuccess: store,
  });
}

export function useUpdateSession(projectId: number) {
  const { store } = useSessionMutations(projectId);
  return useMutation({
    mutationFn: ({ sessionId, ...body }: Input<UpdateSessionInput> & { sessionId: number }) =>
      api.patch<SessionDTO>(`${base(projectId)}/${sessionId}`, body),
    onSuccess: store,
  });
}

export type SessionAction = 'start' | 'complete' | 'resume';

/** Moves a session along planned → in progress → completed (and back to in progress). */
export function useSessionAction(projectId: number) {
  const { store } = useSessionMutations(projectId);
  return useMutation({
    mutationFn: ({ sessionId, action }: { sessionId: number; action: SessionAction }) =>
      api.post<SessionDTO>(`${base(projectId)}/${sessionId}/${action}`),
    onSuccess: store,
  });
}

export function useDeleteSession(projectId: number) {
  const { qc } = useSessionMutations(projectId);
  return useMutation({
    mutationFn: (sessionId: number) => api.delete(`${base(projectId)}/${sessionId}`),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: qk.sessions(projectId),
        predicate: exceptUnder([...qk.sessions(projectId), 'one']),
      }),
  });
}

export function useAddSessionNote(projectId: number) {
  const { store } = useSessionMutations(projectId);
  return useMutation({
    mutationFn: async ({
      sessionId,
      ...body
    }: Input<AddSessionNoteInput> & { sessionId: number }) => {
      await api.post<SessionNoteDTO>(`${base(projectId)}/${sessionId}/notes`, body);
      return api.get<SessionDTO>(`${base(projectId)}/${sessionId}`);
    },
    onSuccess: store,
  });
}

export function useRemoveSessionNote(projectId: number) {
  const { store } = useSessionMutations(projectId);
  return useMutation({
    mutationFn: async ({ sessionId, noteId }: { sessionId: number; noteId: number }) => {
      await api.delete(`${base(projectId)}/${sessionId}/notes/${noteId}`);
      return api.get<SessionDTO>(`${base(projectId)}/${sessionId}`);
    },
    onSuccess: store,
  });
}

export function useLinkSessionDefect(projectId: number) {
  const { store } = useSessionMutations(projectId);
  return useMutation({
    mutationFn: ({ sessionId, defectId }: { sessionId: number; defectId: number }) =>
      api.post<SessionDTO>(`${base(projectId)}/${sessionId}/defects`, { defectId }),
    onSuccess: store,
  });
}

export function useUnlinkSessionDefect(projectId: number) {
  const { store } = useSessionMutations(projectId);
  return useMutation({
    mutationFn: ({ sessionId, defectId }: { sessionId: number; defectId: number }) =>
      api.delete<SessionDTO>(`${base(projectId)}/${sessionId}/defects/${defectId}`),
    onSuccess: store,
  });
}
