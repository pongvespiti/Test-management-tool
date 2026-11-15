'use client';

import {
  STAND_REQUEST_KIND_LABELS,
  type StandEventDTO,
  type StandRequestKind,
  type TechnicianWorkDTO,
} from '@tmt/shared';
import { Download, History, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { SearchInput, SegmentedControl } from '@/components/common/list-controls';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDebouncedValue } from '@/hooks/use-debounce';
import {
  useStandBookings,
  useStandEvents,
  useStandTechnicians,
  useTechnicianWork,
} from '@/lib/api/stands';
import { saveTextFile, toCsv } from '@/lib/save-file';
import { BLUE, GRAY, GREEN, ORANGE } from '@/lib/status';
import { useAuth } from '@/providers/auth-provider';
import { describeRequest } from './stand-requests';
import { periodText, useStandsDates, useStandsT } from './stand-i18n';

const KIND_TONE: Record<StandRequestKind, typeof GREEN> = {
  install: GREEN,
  uninstall: GRAY,
  replace: BLUE,
};

/** All bookings ever (history): the API takes any range. */
const ALL_TIME = { from: '2000-01-01', to: '2100-12-31' };

/**
 * History of the lab: which unit was on which stand for which project (to find a unit again and
 * test it once more), and what each technician did in a year (for the year-end report).
 */
export function StandHistory({
  canRequest,
  onRequestAgain,
}: {
  canRequest: boolean;
  onRequestAgain: (model: string, standId: number | null) => void;
}) {
  const t = useStandsT();
  const [view, setView] = useState<'units' | 'work'>('units');
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        aria-label={t('History')}
        value={view}
        onChange={setView}
        options={[
          { value: 'units', label: t('Units on stands') },
          { value: 'work', label: t('Technician work') },
        ]}
      />
      {view === 'units' ? (
        <UnitHistory canRequest={canRequest} onRequestAgain={onRequestAgain} />
      ) : (
        <TechnicianWork />
      )}
    </div>
  );
}

function ModelChange({ e }: { e: StandEventDTO }) {
  const t = useStandsT();
  return (
    <span className="whitespace-nowrap">
      {e.modelBefore ?? t('Empty')} → <strong>{e.modelAfter ?? t('Empty')}</strong>
    </span>
  );
}

function UnitHistory({
  canRequest,
  onRequestAgain,
}: {
  canRequest: boolean;
  onRequestAgain: (model: string, standId: number | null) => void;
}) {
  const t = useStandsT();
  const fmt = useStandsDates();
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 250) || undefined;
  const events = useStandEvents({ q, limit: 500 });
  const bookings = useStandBookings({ ...ALL_TIME, q });
  const pastBookings = [...(bookings.data ?? [])].reverse();

  return (
    <div className="flex flex-col gap-6">
      <SearchInput
        aria-label={t('Search the history')}
        placeholder={t('Model, stand or project, e.g. ACU-35')}
        className="w-[340px] max-w-full"
        value={text}
        onValueChange={setText}
      />
      <section aria-labelledby="unit-events" className="flex flex-col gap-2">
        <h2 id="unit-events" className="text-base font-semibold">
          {t('Installs and removals')}
        </h2>
        <QueryState query={events}>
          {(events.data ?? []).length === 0 ? (
            <EmptyState
              compact
              icon={<History className="size-6" strokeWidth={1.6} />}
              title={t('No history yet')}
              description={t(
                'Each install, uninstall or replacement shows up here once a technician marks it done or changes a stand.',
              )}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table aria-label={t('Installs and removals')}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">{t('Date')}</TableHead>
                    <TableHead>{t('Stand')}</TableHead>
                    <TableHead>{t('Work')}</TableHead>
                    <TableHead>{t('Unit')}</TableHead>
                    <TableHead>{t('Project')}</TableHead>
                    <TableHead>{t('By')}</TableHead>
                    <TableHead>{t('Note')}</TableHead>
                    {canRequest && <TableHead className="w-[150px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(events.data ?? []).map((e) => {
                    const unit = e.modelAfter ?? e.modelBefore;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{fmt.date(e.at)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-mono text-xs">{e.standCode}</span>
                          <span className="block text-xs text-muted-foreground">{e.zoneName}</span>
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={KIND_TONE[e.kind]}>
                            {t(STAND_REQUEST_KIND_LABELS[e.kind])}
                          </StatusPill>
                          {e.source !== 'request' && (
                            <span className="block text-xs text-muted-foreground">
                              {t(e.source === 'import' ? 'From the sheet' : 'Changed by hand')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ModelChange e={e} />
                        </TableCell>
                        <TableCell>{e.project?.key ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{e.actor.displayName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.note ?? ''}
                        </TableCell>
                        {canRequest && (
                          <TableCell className="text-right">
                            {unit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={t('Request {model} again', { model: unit })}
                                onClick={() => onRequestAgain(unit, e.standId)}
                              >
                                <RotateCcw /> {t('Request again')}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </QueryState>
      </section>

      <section aria-labelledby="unit-bookings" className="flex flex-col gap-2">
        <h2 id="unit-bookings" className="text-base font-semibold">
          {t('Bookings: which unit was tested for which project')}
        </h2>
        <QueryState query={bookings}>
          {pastBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('No bookings found.')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table aria-label={t('Bookings')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Period')}</TableHead>
                    <TableHead>{t('Stand')}</TableHead>
                    <TableHead>{t('Unit')}</TableHead>
                    <TableHead>{t('Project')}</TableHead>
                    <TableHead>{t('Who tests')}</TableHead>
                    <TableHead>{t('Note')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastBookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="whitespace-nowrap">{periodText(fmt, b)}</TableCell>
                      <TableCell className="font-mono text-xs">{b.standCode}</TableCell>
                      <TableCell className="font-medium">{b.model}</TableCell>
                      <TableCell>
                        <StatusPill tone={BLUE}>{b.project.key}</StatusPill>
                      </TableCell>
                      <TableCell>{(b.tester ?? b.createdBy).displayName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.note ?? ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </QueryState>
      </section>
    </div>
  );
}

function TechnicianWork() {
  const t = useStandsT();
  const fmt = useStandsDates();
  const { user, isTechnician } = useAuth();
  const technicians = useStandTechnicians();
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(thisYear);
  const [chosen, setChosen] = useState<number | null>(null);
  const techs = technicians.data ?? [];
  const technicianId = chosen ?? (isTechnician ? (user?.id ?? null) : (techs[0]?.id ?? null));
  const work = useTechnicianWork(technicianId, year);
  const w = work.data;

  const exportCsv = (data: TechnicianWorkDTO) => {
    const rows: (string | number)[][] = [
      [
        t('Date'),
        t('Work'),
        t('Stand'),
        t('Unit'),
        t('Project'),
        t('Requested by'),
        t('Status'),
        t('Note'),
      ],
      ...data.requests.map((r) => [
        (r.doneAt ?? r.updatedAt).slice(0, 10),
        t(STAND_REQUEST_KIND_LABELS[r.kind]),
        r.standCode,
        r.model ?? '',
        r.project?.key ?? '',
        r.requestedBy.displayName,
        t(r.status === 'done' ? 'Done' : 'Rejected'),
        r.technicianNote ?? '',
      ]),
      ...data.events.map((e) => [
        e.at.slice(0, 10),
        t(STAND_REQUEST_KIND_LABELS[e.kind]),
        e.standCode,
        `${e.modelBefore ?? ''} → ${e.modelAfter ?? ''}`,
        e.project?.key ?? '',
        '',
        t(e.source === 'import' ? 'From the sheet' : 'Changed by hand'),
        e.note ?? '',
      ]),
    ];
    saveTextFile(`technician-work-${data.technician.username}-${data.year}.csv`, `﻿${toCsv(rows)}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="work-technician" className="text-sm font-medium">
            {t('Technician')}
          </label>
          <Select
            value={technicianId ? String(technicianId) : undefined}
            onValueChange={(v) => setChosen(Number(v))}
          >
            <SelectTrigger id="work-technician" aria-label={t('Technician')} className="w-[240px]">
              <SelectValue placeholder={t('No technicians yet')} />
            </SelectTrigger>
            <SelectContent>
              {techs.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="work-year" className="text-sm font-medium">
            {t('Year')}
          </label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger id="work-year" aria-label={t('Year')} className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(thisYear - n)}>
                  {thisYear - n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {w && (
          <Button variant="outline" className="ml-auto" onClick={() => exportCsv(w)}>
            <Download /> {t('Export CSV')}
          </Button>
        )}
      </div>
      {technicianId === null ? (
        <p className="text-sm text-muted-foreground">{t('No technicians yet')}</p>
      ) : (
        <QueryState query={work}>
          {w && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label={t('Totals')}>
                {(
                  [
                    ['install', 'Install', GREEN],
                    ['uninstall', 'Uninstall', GRAY],
                    ['replace', 'Replace', BLUE],
                    ['rejected', 'Rejected', ORANGE],
                    ['manual', 'Stand updates', GRAY],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="rounded-xl border bg-card p-3">
                    <p className="text-sm text-muted-foreground">{t(label)}</p>
                    <p className="text-2xl font-semibold">{w.totals[key]}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <Table aria-label={t('Done per month')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Month')}</TableHead>
                      <TableHead className="text-right">{t('Install')}</TableHead>
                      <TableHead className="text-right">{t('Uninstall')}</TableHead>
                      <TableHead className="text-right">{t('Replace')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {w.months
                      .filter((m) => m.install + m.uninstall + m.replace > 0)
                      .map((m) => (
                        <TableRow key={m.month}>
                          <TableCell>{fmt.month(w.year, m.month)}</TableCell>
                          <TableCell className="text-right">{m.install}</TableCell>
                          <TableCell className="text-right">{m.uninstall}</TableCell>
                          <TableCell className="text-right">{m.replace}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              <section aria-labelledby="work-list" className="flex flex-col gap-2">
                <h2 id="work-list" className="text-base font-semibold">
                  {t('Requests handled in {year}', { year: w.year })}
                </h2>
                {w.requests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('None in this year.')}</p>
                ) : (
                  <ul className="flex flex-col divide-y rounded-xl border bg-card">
                    {w.requests.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                      >
                        <span className="w-[120px] text-muted-foreground">
                          {fmt.date(r.doneAt ?? r.updatedAt)}
                        </span>
                        <span className="font-medium">{describeRequest(r, t)}</span>
                        <span className="text-muted-foreground">
                          {t('at {code} · {zone}', { code: r.standCode, zone: r.zoneName })}
                          {r.project && ` · ${r.project.key}`} · {r.requestedBy.displayName}
                        </span>
                        {r.status === 'rejected' && (
                          <StatusPill tone={ORANGE}>{t('Rejected')}</StatusPill>
                        )}
                        {r.technicianNote && (
                          <span className="w-full text-muted-foreground">{r.technicianNote}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </QueryState>
      )}
    </div>
  );
}
