'use client';

import {
  createStandBookingSchema,
  createStandRequestSchema,
  createStandSchema,
  createStandZoneSchema,
  roleAtLeast,
  STAND_REQUEST_KINDS,
  STAND_REQUEST_KIND_LABELS,
  type StandBookingDTO,
  type StandDTO,
  type StandRequestKind,
  type StandZoneDTO,
} from '@tmt/shared';
import { useState, type ReactNode } from 'react';
import { DateInput } from '@/components/common/date-input';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import {
  useCreateBooking,
  useCreateStand,
  useCreateStandRequest,
  useCreateZone,
  useStandTechnicians,
  useUpdateBooking,
  useUpdateStand,
  useUpdateZone,
} from '@/lib/api/stands';
import { schemaErrors } from '@/lib/form-errors';
import { notifyError, notifySuccess } from '@/lib/notify';
import { getLastProjectId } from '@/lib/storage';
import { useAuth } from '@/providers/auth-provider';
import { addDaysIso, todayIso } from './stand-dates';
import { useStandsDates, useStandsT } from './stand-i18n';

const FIELD = 'flex flex-col gap-1.5';
const LABEL = 'text-sm font-medium';
const NONE = '__none__';

function FieldError({ message }: { message?: string }) {
  const t = useStandsT();
  return message ? <p className="text-sm text-destructive">{t(message)}</p> : null;
}

/** Labelled Radix select of a few options (`''` = nothing chosen). */
function Pick({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  invalid?: boolean;
}) {
  const t = useStandsT();
  return (
    <div className={FIELD}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <Select value={value || undefined} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        <SelectTrigger id={id} aria-label={label} className="w-full" aria-invalid={invalid}>
          <SelectValue placeholder={placeholder ?? t('Choose …')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || NONE} value={o.value || NONE}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FormDialog({
  title,
  description,
  onClose,
  onSubmit,
  submitLabel,
  pending,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
  children: ReactNode;
}) {
  const t = useStandsT();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- zone

export function ZoneForm({ zone, onClose }: { zone: StandZoneDTO | null; onClose: () => void }) {
  const create = useCreateZone();
  const update = useUpdateZone();
  const t = useStandsT();
  const [name, setName] = useState(zone?.name ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const found = schemaErrors(createStandZoneSchema, { name });
    if (Object.keys(found).length > 0) return setErrors(found);
    try {
      if (zone) await update.mutateAsync({ zoneId: zone.id, name });
      else await create.mutateAsync({ name });
      notifySuccess(zone ? t('Zone renamed.') : t('Zone {name} added.', { name: name.trim() }));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STAND_ZONE_NAME_TAKEN')
        setErrors({ name: 'Another zone has this name' });
      else notifyError(err, t('Could not save the zone'));
    }
  };

  return (
    <FormDialog
      title={zone ? t('Rename {name}', { name: zone.name }) : t('New zone')}
      description={t('An area of the lab with test stands.')}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={t(zone ? 'Save' : 'Add zone')}
      pending={create.isPending || update.isPending}
    >
      <div className={FIELD}>
        <label htmlFor="zone-name" className={LABEL}>
          {t('Name')}
        </label>
        <Input
          id="zone-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Zone A"
          aria-invalid={!!errors.name}
        />
        <FieldError message={errors.name} />
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------- stand

/** Add a stand, or update one (technicians: the model installed now, who is in charge …). */
export function StandForm({
  stand,
  zones,
  zoneId,
  onClose,
}: {
  stand: StandDTO | null;
  zones: StandZoneDTO[];
  /** Zone of a new stand. */
  zoneId?: number;
  onClose: () => void;
}) {
  const create = useCreateStand();
  const update = useUpdateStand();
  const t = useStandsT();
  const [zone, setZone] = useState(String(stand?.zoneId ?? zoneId ?? zones[0]?.id ?? ''));
  const [code, setCode] = useState(stand?.code ?? '');
  const [model, setModel] = useState(stand?.currentModel ?? '');
  const [inCharge, setInCharge] = useState(stand?.inCharge ?? '');
  const [note, setNote] = useState(stand?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const body = {
      zoneId: Number(zone),
      code,
      currentModel: model,
      inCharge,
      note,
    };
    const found = schemaErrors(createStandSchema, body);
    if (Object.keys(found).length > 0) return setErrors(found);
    try {
      if (stand) await update.mutateAsync({ standId: stand.id, ...body });
      else await create.mutateAsync(body);
      notifySuccess(
        stand
          ? t('{code} saved.', { code: code.trim() })
          : t('Stand {code} added.', { code: code.trim() }),
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STAND_CODE_TAKEN')
        setErrors({ code: 'Another stand has this code' });
      else notifyError(err, t('Could not save the stand'));
    }
  };

  return (
    <FormDialog
      title={stand ? t('Edit {code}', { code: stand.code }) : t('New stand')}
      description={t('Keep the model installed up to date so testers can find it.')}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={t(stand ? 'Save' : 'Add stand')}
      pending={create.isPending || update.isPending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={FIELD}>
          <label htmlFor="stand-code" className={LABEL}>
            {t('Stand code')}
          </label>
          <Input
            id="stand-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="L1/A-1"
            aria-invalid={!!errors.code}
          />
          <FieldError message={errors.code} />
        </div>
        <Pick
          id="stand-zone"
          label={t('Zone')}
          value={zone}
          onChange={setZone}
          options={zones.map((z) => ({ value: String(z.id), label: z.name }))}
          invalid={!!errors.zoneId}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={FIELD}>
          <label htmlFor="stand-model" className={LABEL}>
            {t('Model installed')}
          </label>
          <Input
            id="stand-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t('Empty')}
          />
          <FieldError message={errors.currentModel} />
        </div>
        <div className={FIELD}>
          <label htmlFor="stand-in-charge" className={LABEL}>
            {t('In charge')}
          </label>
          <Input
            id="stand-in-charge"
            value={inCharge}
            onChange={(e) => setInCharge(e.target.value)}
          />
        </div>
      </div>
      <div className={FIELD}>
        <label htmlFor="stand-note" className={LABEL}>
          {t('Note')}
        </label>
        <Textarea id="stand-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------- booking

/** Projects where the user may book or send requests (tester or lead; admins: all of theirs). */
export function useBookableProjects(): { id: number; label: string }[] {
  const { me } = useAuth();
  return (me?.memberships ?? [])
    .filter((m) => me?.user.isAdmin || roleAtLeast(m.role, 'tester'))
    .map((m) => ({ id: m.projectId, label: `${m.projectKey} — ${m.projectName}` }));
}

function defaultProject(projects: { id: number }[]): string {
  const last = getLastProjectId();
  const match = projects.find((p) => p.id === last) ?? projects[0];
  return match ? String(match.id) : '';
}

/** Book a stand for a project's testing over a range of days. */
export function BookingForm({
  booking,
  stands,
  standId,
  onClose,
}: {
  booking: StandBookingDTO | null;
  stands: StandDTO[];
  standId?: number;
  onClose: () => void;
}) {
  const create = useCreateBooking();
  const update = useUpdateBooking();
  const t = useStandsT();
  const fmt = useStandsDates();
  const projects = useBookableProjects();
  const today = todayIso();
  const [stand, setStand] = useState(String(booking?.standId ?? standId ?? ''));
  const [project, setProject] = useState(
    booking ? String(booking.project.id) : defaultProject(projects),
  );
  const [model, setModel] = useState(booking?.model ?? '');
  const [start, setStart] = useState<string | null>(booking?.startDate ?? today);
  const [end, setEnd] = useState<string | null>(booking?.endDate ?? addDaysIso(today, 6));
  const [note, setNote] = useState(booking?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** The booking in the way, in the page's language (the API's message is English). */
  const clashText = (err: ApiError) => {
    const b = (err.details as { booking?: StandBookingDTO } | undefined)?.booking;
    if (!b) return err.message;
    return t('{code} is booked for {project} from {from} to {to}', {
      code: b.standCode,
      project: b.project.key,
      from: fmt.date(b.startDate),
      to: fmt.date(b.endDate),
    });
  };

  const submit = async () => {
    const body = {
      standId: Number(stand),
      projectId: Number(project),
      model,
      startDate: start ?? '',
      endDate: end ?? '',
      note,
    };
    const found = schemaErrors(createStandBookingSchema, body);
    if (Object.keys(found).length > 0) return setErrors(found);
    setErrors({});
    try {
      if (booking)
        await update.mutateAsync({
          bookingId: booking.id,
          model,
          startDate: body.startDate,
          endDate: body.endDate,
          note,
        });
      else await create.mutateAsync(body);
      notifySuccess(t(booking ? 'Booking saved.' : 'Stand booked.'));
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STAND_BOOKED')
        setErrors({ root: clashText(err) });
      else notifyError(err, t('Could not save the booking'));
    }
  };

  return (
    <FormDialog
      title={booking ? t('Booking of {code}', { code: booking.standCode }) : t('Book a stand')}
      description={t(
        "Reserve a stand for your project's tests. Days that overlap another booking are refused.",
      )}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={t(booking ? 'Save' : 'Book')}
      pending={create.isPending || update.isPending}
    >
      {errors.root && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors.root}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {!booking && (
          <Pick
            id="booking-stand"
            label={t('Stand')}
            value={stand}
            onChange={setStand}
            options={stands.map((s) => ({
              value: String(s.id),
              label: s.currentModel
                ? `${s.code} (${s.currentModel})`
                : t('{code} (empty)', { code: s.code }),
            }))}
            invalid={!!errors.standId}
          />
        )}
        {!booking && (
          <Pick
            id="booking-project"
            label={t('Project')}
            value={project}
            onChange={setProject}
            options={projects.map((p) => ({ value: String(p.id), label: p.label }))}
            invalid={!!errors.projectId}
          />
        )}
      </div>
      {(errors.standId || errors.projectId) && (
        <FieldError message="Choose the stand and the project" />
      )}
      <div className={FIELD}>
        <label htmlFor="booking-model" className={LABEL}>
          {t('Model to test')}
        </label>
        <Input
          id="booking-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          aria-invalid={!!errors.model}
        />
        <FieldError message={errors.model} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={FIELD}>
          <label htmlFor="booking-start" className={LABEL}>
            {t('From')}
          </label>
          <DateInput
            id="booking-start"
            value={start}
            onChange={setStart}
            clearable={false}
            formatValue={fmt.date}
            locale={fmt.locale}
          />
          <FieldError message={errors.startDate} />
        </div>
        <div className={FIELD}>
          <label htmlFor="booking-end" className={LABEL}>
            {t('To (included)')}
          </label>
          <DateInput
            id="booking-end"
            value={end}
            onChange={setEnd}
            clearable={false}
            formatValue={fmt.date}
            locale={fmt.locale}
          />
          <FieldError message={errors.endDate} />
        </div>
      </div>
      <div className={FIELD}>
        <label htmlFor="booking-note" className={LABEL}>
          {t('Note')}
        </label>
        <Textarea
          id="booking-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------- request

/** Ask a technician to install, uninstall or replace the unit on a stand on a day. */
export function RequestForm({
  stands,
  standId,
  onClose,
}: {
  stands: StandDTO[];
  standId?: number;
  onClose: () => void;
}) {
  const create = useCreateStandRequest();
  const technicians = useStandTechnicians();
  const t = useStandsT();
  const fmt = useStandsDates();
  const projects = useBookableProjects();
  const [stand, setStand] = useState(String(standId ?? ''));
  const [kind, setKind] = useState<StandRequestKind>('install');
  const [model, setModel] = useState('');
  const [technician, setTechnician] = useState('');
  const [project, setProject] = useState(defaultProject(projects));
  const [day, setDay] = useState<string | null>(addDaysIso(todayIso(), 1));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const techs = technicians.data ?? [];

  const submit = async () => {
    const body = {
      standId: Number(stand),
      projectId: project ? Number(project) : null,
      kind,
      model: kind === 'uninstall' ? null : model,
      technicianId: Number(technician),
      requestedDate: day ?? '',
      note,
    };
    const found = schemaErrors(createStandRequestSchema, body);
    if (Object.keys(found).length > 0) return setErrors(found);
    setErrors({});
    try {
      const sent = await create.mutateAsync(body);
      notifySuccess(t('Request sent to {name}.', { name: sent.technician.displayName }));
      onClose();
    } catch (err) {
      notifyError(err, t('Could not send the request'));
    }
  };

  return (
    <FormDialog
      title={t('Request a technician')}
      description={t(
        'The technician gets a notification, then accepts (maybe on another day) or rejects. You are notified at each step.',
      )}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={t('Send request')}
      pending={create.isPending}
    >
      <div className={FIELD}>
        <span className={LABEL}>{t('Work')}</span>
        <SegmentedControl
          aria-label={t('Work')}
          value={kind}
          onChange={setKind}
          options={STAND_REQUEST_KINDS.map((k) => ({
            value: k,
            label: t(STAND_REQUEST_KIND_LABELS[k]),
          }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Pick
          id="request-stand"
          label={t('Stand')}
          value={stand}
          onChange={setStand}
          options={stands.map((s) => ({
            value: String(s.id),
            label: s.currentModel
              ? `${s.code} (${s.currentModel})`
              : t('{code} (empty)', { code: s.code }),
          }))}
          invalid={!!errors.standId}
        />
        <Pick
          id="request-technician"
          label={t('Technician')}
          value={technician}
          onChange={setTechnician}
          placeholder={t(techs.length === 0 ? 'No technicians yet' : 'Choose …')}
          options={techs.map((u) => ({ value: String(u.id), label: u.displayName }))}
          invalid={!!errors.technicianId}
        />
      </div>
      {(errors.standId || errors.technicianId) && (
        <FieldError message="Choose the stand and the technician" />
      )}
      {kind !== 'uninstall' && (
        <div className={FIELD}>
          <label htmlFor="request-model" className={LABEL}>
            {t('Model to install')}
          </label>
          <Input
            id="request-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-invalid={!!errors.model}
          />
          <FieldError message={errors.model} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={FIELD}>
          <label htmlFor="request-day" className={LABEL}>
            {t('Day')}
          </label>
          <DateInput
            id="request-day"
            value={day}
            onChange={setDay}
            clearable={false}
            formatValue={fmt.date}
            locale={fmt.locale}
          />
          <FieldError message={errors.requestedDate} />
        </div>
        <Pick
          id="request-project"
          label={t('Project (optional)')}
          value={project}
          onChange={setProject}
          options={[
            { value: '', label: t('No project') },
            ...projects.map((p) => ({ value: String(p.id), label: p.label })),
          ]}
        />
      </div>
      <div className={FIELD}>
        <label htmlFor="request-note" className={LABEL}>
          {t('Note for the technician')}
        </label>
        <Textarea
          id="request-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
