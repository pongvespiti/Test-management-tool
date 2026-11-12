'use client';

import { createDeviceSchema, DEVICE_KINDS, DEVICE_KIND_LABELS, type DeviceDTO } from '@tmt/shared';
import { useState } from 'react';
import { SegmentedControl } from '@/components/common/list-controls';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { useCreateDevice, useUpdateDevice } from '@/lib/api/devices';
import { schemaErrors } from '@/lib/form-errors';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';

const FIELD = 'flex flex-col gap-1.5';
const LABEL = 'text-sm font-medium';

/** Register a device, or edit one. */
export function DeviceForm({ device, onClose }: { device: DeviceDTO | null; onClose: () => void }) {
  const { projectId } = useProject();
  const create = useCreateDevice(projectId);
  const update = useUpdateDevice(projectId);
  const [kind, setKind] = useState(device?.kind ?? 'unit');
  const [name, setName] = useState(device?.name ?? '');
  const [model, setModel] = useState(device?.model ?? '');
  const [serial, setSerial] = useState(device?.serial ?? '');
  const [osVersion, setOsVersion] = useState(device?.osVersion ?? '');
  const [note, setNote] = useState(device?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const body = { kind, name, model, serial, osVersion, note };
    const found = schemaErrors(createDeviceSchema, body);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    try {
      if (device) await update.mutateAsync({ deviceId: device.id, ...body });
      else await create.mutateAsync(body);
      notifySuccess(device ? `${name.trim()} saved.` : `Device ${name.trim()} added.`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DEVICE_NAME_TAKEN')
        setErrors({ name: 'Another device has this name' });
      else notifyError(err, 'Could not save the device');
    }
  };

  const error = (field: string) =>
    errors[field] ? <p className="text-sm text-destructive">{errors[field]}</p> : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{device ? `Edit ${device.name}` : 'New device'}</DialogTitle>
          <DialogDescription>
            A unit, phone or router the team tests with. Whoever takes it is shown as its holder.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={FIELD}>
            <span className={LABEL} id="device-kind-label">
              Kind
            </span>
            <SegmentedControl
              aria-label="Kind"
              value={kind}
              onChange={setKind}
              options={DEVICE_KINDS.map((k) => ({ value: k, label: DEVICE_KIND_LABELS[k] }))}
            />
          </div>
          <div className={FIELD}>
            <label htmlFor="device-name" className={LABEL}>
              Name
            </label>
            <Input
              id="device-name"
              autoFocus={!device}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Unit A, Pixel 9, Router R1 …"
              aria-invalid={!!errors.name}
            />
            {error('name')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={FIELD}>
              <label htmlFor="device-model" className={LABEL}>
                Model
              </label>
              <Input id="device-model" value={model} onChange={(e) => setModel(e.target.value)} />
              {error('model')}
            </div>
            <div className={FIELD}>
              <label htmlFor="device-serial" className={LABEL}>
                Serial number
              </label>
              <Input
                id="device-serial"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className="font-mono"
              />
              {error('serial')}
            </div>
          </div>
          <div className={FIELD}>
            <label htmlFor="device-os" className={LABEL}>
              OS / firmware
            </label>
            <Input
              id="device-os"
              value={osVersion}
              onChange={(e) => setOsVersion(e.target.value)}
              placeholder="Android 15, FW 2.0.1 …"
            />
            {error('osVersion')}
          </div>
          <div className={FIELD}>
            <label htmlFor="device-note" className={LABEL}>
              Note
            </label>
            <Textarea
              id="device-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error('note')}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {device ? 'Save' : 'Add device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
