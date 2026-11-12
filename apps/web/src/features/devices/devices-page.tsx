'use client';

import {
  DEVICE_KINDS,
  DEVICE_KIND_LABELS,
  DEVICE_STATUSES,
  DEVICE_STATUS_LABELS,
  type DeviceDTO,
  type DeviceKind,
  type DeviceStatus,
} from '@tmt/shared';
import { Plus, Smartphone } from 'lucide-react';
import { DeviceStatusBadge } from '@/components/common/badges';
import { confirmDelete } from '@/components/common/confirm-host';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { SearchInput, SegmentedControl } from '@/components/common/list-controls';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { useModalTarget } from '@/hooks/use-modal-target';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import {
  useCheckOutDevice,
  useDeleteDevice,
  useDevices,
  useReturnDevice,
  useUpdateDevice,
} from '@/lib/api/devices';
import { formatRelative } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useAuth } from '@/providers/auth-provider';
import { useProject } from '@/providers/project-provider';
import { DeviceForm } from './device-form';

type KindFilter = DeviceKind | 'all';
type StatusFilter = DeviceStatus | 'all';
const KINDS: KindFilter[] = ['all', ...DEVICE_KINDS];
const STATUSES: StatusFilter[] = ['all', ...DEVICE_STATUSES];

const pick = <T extends string>(all: readonly T[], value: string | null, fallback: T): T =>
  all.find((v) => v === value) ?? fallback;

/** Runs a device action and tells the person how it went. */
const run = async (action: () => Promise<unknown>, done: string, failed: string) => {
  try {
    await action();
    notifySuccess(done);
  } catch (err) {
    notifyError(err, failed);
  }
};

/** Route `/projects/[projectId]/devices`: the units, phones and routers of the team and who holds them. */
export function DevicesPage() {
  const { project, projectId, can } = useProject();
  const { user } = useAuth();
  const [params, setParams] = useUrlSearchParams();
  const kind = pick(KINDS, params.get('kind'), 'all');
  const status = pick(STATUSES, params.get('status'), 'all');
  const mine = params.get('mine') === 'true';
  const text = params.get('q') ?? '';
  const q = useDebouncedValue(text.trim(), 250);
  const editor = useModalTarget<DeviceDTO | null>();
  const query = useDevices(projectId, {
    kind: kind === 'all' ? undefined : kind,
    status: status === 'all' ? undefined : status,
    q: q || undefined,
    mine: mine || undefined,
  });
  const checkOut = useCheckOutDevice(projectId);
  const giveBack = useReturnDevice(projectId);
  const update = useUpdateDevice(projectId);
  const remove = useDeleteDevice(projectId);
  const items = query.data ?? [];
  const canWrite = can('writeDevices');
  const filtered = kind !== 'all' || status !== 'all' || mine || q !== '';

  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });

  const newButton = canWrite && (
    <Button onClick={() => editor.open(null)}>
      <Plus /> New device
    </Button>
  );

  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Devices"
        subtitle="Units, phones and routers the team tests with, and who has each one now"
        actions={newButton}
      />
      <div
        role="group"
        aria-label="Device filters"
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        <SearchInput
          aria-label="Search devices"
          placeholder="Search by name, model, serial or holder"
          className="w-[320px] max-w-full"
          value={text}
          onValueChange={(v) => set({ q: v || null })}
        />
        <SegmentedControl
          aria-label="Kind"
          value={kind}
          onChange={(v) => set({ kind: v === 'all' ? null : v })}
          options={KINDS.map((k) => ({
            value: k,
            label: k === 'all' ? 'All kinds' : DEVICE_KIND_LABELS[k],
          }))}
        />
        <SegmentedControl
          aria-label="Status"
          value={status}
          onChange={(v) => set({ status: v === 'all' ? null : v })}
          options={STATUSES.map((s) => ({
            value: s,
            label: s === 'all' ? 'Any status' : DEVICE_STATUS_LABELS[s],
          }))}
        />
        <SegmentedControl
          aria-label="Holder"
          value={mine ? 'mine' : 'all'}
          onChange={(v) => set({ mine: v === 'mine' ? 'true' : null })}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'mine', label: 'Held by me' },
          ]}
        />
      </div>
      <QueryState query={query}>
        {items.length === 0 ? (
          <EmptyState
            icon={<Smartphone className="size-6" strokeWidth={1.6} />}
            title={filtered ? 'No devices match' : 'No devices yet'}
            description="Register the units, phones and routers you test with. Anyone on the team can then see what is free and who has the rest."
            action={filtered ? undefined : newButton || undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[150px]">Kind</TableHead>
                  <TableHead>Model / serial</TableHead>
                  <TableHead className="w-[150px]">OS / firmware</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[180px]">Holder</TableHead>
                  <TableHead className="w-[250px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => {
                  const mineNow = d.holder?.id === user?.id;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.name}
                        {d.note && (
                          <p className="text-xs font-normal text-muted-foreground">{d.note}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{DEVICE_KIND_LABELS[d.kind]}</TableCell>
                      <TableCell className="text-sm">
                        {d.model ?? <span className="text-muted-foreground">—</span>}
                        {d.serial && (
                          <span className="block font-mono text-xs text-muted-foreground">
                            {d.serial}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{d.osVersion ?? '—'}</TableCell>
                      <TableCell>
                        <DeviceStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.holder ? (
                          <>
                            {d.holder.displayName}
                            {d.heldSince && (
                              <span className="block text-xs text-muted-foreground">
                                since {formatRelative(d.heldSince)}
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canWrite && (
                          <div className="flex flex-wrap justify-end gap-1">
                            {d.status === 'available' && (
                              <Button
                                size="sm"
                                aria-label={`Take ${d.name}`}
                                onClick={() =>
                                  void run(
                                    () => checkOut.mutateAsync(d.id),
                                    `You have ${d.name}.`,
                                    'Could not take the device',
                                  )
                                }
                              >
                                Take
                              </Button>
                            )}
                            {d.status === 'in_use' && (mineNow || can('deleteDevices')) && (
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={`Return ${d.name}`}
                                onClick={() =>
                                  void run(
                                    () => giveBack.mutateAsync(d.id),
                                    `${d.name} returned.`,
                                    'Could not return the device',
                                  )
                                }
                              >
                                Return
                              </Button>
                            )}
                            {d.status !== 'in_use' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={
                                  d.status === 'repair'
                                    ? `${d.name} is back from repair`
                                    : `Send ${d.name} to repair`
                                }
                                onClick={() =>
                                  void run(
                                    () =>
                                      update.mutateAsync({
                                        deviceId: d.id,
                                        status: d.status === 'repair' ? 'available' : 'repair',
                                      }),
                                    d.status === 'repair'
                                      ? `${d.name} is available again.`
                                      : `${d.name} is in repair.`,
                                    'Could not change the status',
                                  )
                                }
                              >
                                {d.status === 'repair' ? 'Back from repair' : 'Repair'}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Edit ${d.name}`}
                              onClick={() => editor.open(d)}
                            >
                              Edit
                            </Button>
                            {can('deleteDevices') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Delete ${d.name}`}
                                onClick={() =>
                                  confirmDelete(`device ${d.name}`, () =>
                                    run(
                                      () => remove.mutateAsync(d.id),
                                      `${d.name} deleted.`,
                                      'Could not delete the device',
                                    ),
                                  )
                                }
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryState>
      {editor.opened && (
        <DeviceForm key={editor.key} device={editor.target} onClose={editor.close} />
      )}
    </>
  );
}
