'use client';

import type { StandBookingDTO, StandDTO, StandZoneDTO } from '@tmt/shared';
import { CalendarPlus, Plus, Wrench } from 'lucide-react';
import { useState } from 'react';
import { QueryState } from '@/components/common/error-alert';
import { SearchInput, SegmentedControl } from '@/components/common/list-controls';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounce';
import { useUrlSearchParams } from '@/hooks/use-url-search-params';
import { useStandBoard } from '@/lib/api/stands';
import { LOCALE_LABELS, LOCALES, useLocale } from '@/lib/i18n';
import { BookingTimeline } from './booking-timeline';
import { StandBoard } from './stand-board';
import { StandDetail } from './stand-detail';
import { BookingForm, RequestForm, StandForm, ZoneForm } from './stand-forms';
import { StandHistory } from './stand-history';
import { StandImport } from './stand-import';
import { useStandsT } from './stand-i18n';
import { StandRequests } from './stand-requests';

type Tab = 'board' | 'bookings' | 'requests' | 'history' | 'import';

type Editing =
  | { kind: 'zone'; zone: StandZoneDTO | null }
  | { kind: 'stand'; stand: StandDTO | null; zoneId?: number }
  | { kind: 'booking'; booking: StandBookingDTO | null; standId?: number }
  | { kind: 'request'; standId?: number; model?: string };

/**
 * Route `/stands`: the lab's test stands, shared by every project. Find where a model is
 * installed, book a stand for a project, and ask a technician to install or uninstall a unit.
 * Technician accounts see only this page.
 */
export function StandsPage() {
  const [params, setParams] = useUrlSearchParams();
  const t = useStandsT();
  const { locale, setLocale } = useLocale();
  const all = useStandBoard();
  const board = all.data;
  const canManage = board?.canManage ?? false;
  const canRequest = board?.canRequest ?? false;
  const tabs: Tab[] = canManage
    ? ['board', 'bookings', 'requests', 'history', 'import']
    : ['board', 'bookings', 'requests', 'history'];
  const tab = (tabs.find((x) => x === params.get('tab')) ?? 'board') as Tab;
  const text = params.get('model') ?? '';
  const search = useDebouncedValue(text.trim(), 250);
  const filtered = useStandBoard({ model: search || undefined });
  const standId = Number(params.get('stand')) || null;
  const requestId = Number(params.get('request')) || null;
  const [editing, setEditing] = useState<Editing | null>(null);

  const stands = (board?.zones ?? []).flatMap((z) => z.stands);
  const openStand = standId ? stands.find((s) => s.id === standId) : undefined;

  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });
  const edit = (e: Editing) => {
    set({ stand: null });
    setEditing(e);
  };

  const actions = (
    <div className="flex flex-wrap gap-2">
      {canRequest && (
        <>
          <Button onClick={() => edit({ kind: 'booking', booking: null })}>
            <CalendarPlus /> {t('Book a stand')}
          </Button>
          <Button variant="outline" onClick={() => edit({ kind: 'request' })}>
            <Wrench /> {t('Request technician')}
          </Button>
        </>
      )}
      {canManage && (
        <Button variant="outline" onClick={() => edit({ kind: 'zone', zone: null })}>
          <Plus /> {t('New zone')}
        </Button>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={t('Lab')}
        title={t('Test stands')}
        subtitle={t(
          'Which AC model is on which stand, who has a stand booked, and install / uninstall requests to technicians',
        )}
        actions={actions}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          aria-label={t('View')}
          value={tab}
          onChange={(v) => set({ tab: v === 'board' ? null : v, request: null })}
          options={tabs.map((tb) => ({
            value: tb,
            label: t(
              {
                board: 'Stands',
                bookings: 'Bookings',
                requests: 'Requests',
                history: 'History',
                import: 'Import',
              }[tb],
            ),
          }))}
        />
        {tab === 'board' && (
          <SearchInput
            aria-label={t('Find a model')}
            placeholder={t('Find a model, e.g. ACU-35')}
            className="w-[300px] max-w-full"
            value={text}
            onValueChange={(v) => set({ model: v || null })}
          />
        )}
        <SegmentedControl
          className="ml-auto"
          aria-label={t('Language')}
          value={locale}
          onChange={setLocale}
          options={LOCALES.map((l) => ({ value: l, label: l === 'th' ? 'ไทย' : LOCALE_LABELS[l] }))}
        />
      </div>

      {tab === 'board' && (
        <QueryState query={filtered}>
          {filtered.data && (
            <StandBoard
              board={filtered.data}
              search={search}
              onOpen={(s) => set({ stand: String(s.id) })}
              onAddStand={(z) => edit({ kind: 'stand', stand: null, zoneId: z.id })}
              onEditZone={(z) => edit({ kind: 'zone', zone: z })}
              onAddZone={() => edit({ kind: 'zone', zone: null })}
            />
          )}
        </QueryState>
      )}
      {tab === 'bookings' && (
        <QueryState query={all}>
          {board && (
            <BookingTimeline board={board} onOpen={(b) => set({ stand: String(b.standId) })} />
          )}
        </QueryState>
      )}
      {tab === 'requests' && <StandRequests highlight={requestId} />}
      {tab === 'history' && (
        <StandHistory
          canRequest={canRequest}
          onRequestAgain={(model, standId) =>
            edit({ kind: 'request', model, standId: standId ?? undefined })
          }
        />
      )}
      {tab === 'import' && canManage && <StandImport onDone={() => set({ tab: null })} />}

      {openStand && (
        <StandDetail
          key={openStand.id}
          stand={openStand}
          canManage={canManage}
          canRequest={canRequest}
          onClose={() => set({ stand: null })}
          onEdit={() => edit({ kind: 'stand', stand: openStand })}
          onBook={() => edit({ kind: 'booking', booking: null, standId: openStand.id })}
          onRequest={() => edit({ kind: 'request', standId: openStand.id })}
          onEditBooking={(b) => edit({ kind: 'booking', booking: b })}
        />
      )}
      {editing?.kind === 'zone' && (
        <ZoneForm zone={editing.zone} onClose={() => setEditing(null)} />
      )}
      {editing?.kind === 'stand' && (
        <StandForm
          stand={editing.stand}
          zones={board?.zones ?? []}
          zoneId={editing.zoneId}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'booking' && (
        <BookingForm
          booking={editing.booking}
          stands={stands}
          standId={editing.standId}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'request' && (
        <RequestForm
          stands={stands}
          standId={editing.standId}
          model={editing.model}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
