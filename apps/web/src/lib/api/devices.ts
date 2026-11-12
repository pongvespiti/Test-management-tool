import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDeviceInput,
  DeviceDTO,
  ListDevicesQuery,
  UpdateDeviceInput,
} from '@tmt/shared';
import { api } from './client';
import { qk } from './keys';

const base = (projectId: number) => `/projects/${projectId}/devices`;

/** Test devices of the project (by kind, then name). */
export function useDevices(projectId: number, params: ListDevicesQuery = {}) {
  return useQuery({
    queryKey: qk.deviceList(projectId, params),
    queryFn: () =>
      api.get<DeviceDTO[]>(base(projectId), {
        kind: params.kind,
        status: params.status,
        q: params.q,
        mine: params.mine === undefined ? undefined : String(params.mine),
      }),
    placeholderData: keepPreviousData,
  });
}

function useRefresh(projectId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.devices(projectId) });
}

export function useCreateDevice(projectId: number) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (body: CreateDeviceInput) => api.post<DeviceDTO>(base(projectId), body),
    onSuccess: refresh,
  });
}

export function useUpdateDevice(projectId: number) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: ({ deviceId, ...body }: UpdateDeviceInput & { deviceId: number }) =>
      api.patch<DeviceDTO>(`${base(projectId)}/${deviceId}`, body),
    onSuccess: refresh,
  });
}

export function useDeleteDevice(projectId: number) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (deviceId: number) => api.delete<void>(`${base(projectId)}/${deviceId}`),
    onSuccess: refresh,
  });
}

export function useCheckOutDevice(projectId: number) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (deviceId: number) =>
      api.post<DeviceDTO>(`${base(projectId)}/${deviceId}/check-out`),
    onSettled: refresh,
  });
}

export function useReturnDevice(projectId: number) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (deviceId: number) => api.post<DeviceDTO>(`${base(projectId)}/${deviceId}/return`),
    onSettled: refresh,
  });
}
