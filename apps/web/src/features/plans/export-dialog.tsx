'use client';

import type { PlanDTO } from '@tmt/shared';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { ErrorAlert, QueryState } from '@/components/common/error-alert';
import { StatusPill } from '@/components/common/status-pill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { downloadPlanExport } from '@/lib/api/plans';
import { useTemplates } from '@/lib/api/templates';
import { notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { BLUE, GRAY, TEAL } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { preferredTemplate } from './plan-utils';

interface Props {
  plan: PlanDTO;
  open: boolean;
  /** Changes on every open so the choice starts fresh. */
  formKey: number;
  onClose: () => void;
}

/** Choose a report template and download the filled Excel test report. */
export function ExportDialog({ plan, open, formKey, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Export test report</DialogTitle>
        </DialogHeader>
        <ExportBody key={formKey} plan={plan} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function ExportBody({ plan, onClose }: Pick<Props, 'plan' | 'onClose'>) {
  const { projectId } = useProject();
  const legendId = useId();
  const templates = useTemplates(projectId);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const list = templates.data ?? [];
  const preferred = preferredTemplate(plan, list);
  const value = picked ?? (preferred ? String(preferred.id) : null);

  const download = async () => {
    if (value === null) return;
    setBusy(true);
    setError(null);
    try {
      // Explicit id (0 = built-in template) so the chosen form is used even if defaults change.
      await downloadPlanExport(projectId, plan, Number(value));
      notifySuccess(`Test report ${plan.docNo} downloaded.`);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        The report fills your controlled Excel form: the summary sheet, one sheet per run and the
        result tables. Formatting, merged cells, logos and print setup stay as in the template.
      </p>
      <QueryState query={templates}>
        <div className="flex flex-col gap-2">
          <p id={legendId} className="text-sm font-medium">
            Report template
          </p>
          <RadioGroup
            aria-labelledby={legendId}
            value={value ?? ''}
            onValueChange={setPicked}
            className="gap-2"
          >
            {list.map((t) => {
              const id = `${legendId}-${t.id}`;
              const checked = value === String(t.id);
              return (
                <label
                  key={t.id}
                  htmlFor={id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/60',
                    checked && 'border-primary bg-accent/40',
                  )}
                >
                  <RadioGroupItem id={id} value={String(t.id)} className="mt-0.5" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">{t.name}</span>
                      {t.builtIn && <StatusPill tone={GRAY}>Built-in</StatusPill>}
                      {t.isDefault && <StatusPill tone={BLUE}>Project default</StatusPill>}
                      {!t.builtIn && t.id === plan.templateId && (
                        <StatusPill tone={TEAL}>This plan&apos;s template</StatusPill>
                      )}
                    </span>
                    {t.description && (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {t.description}
                      </span>
                    )}
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {t.fileName}
                    </span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </div>
      </QueryState>
      {error !== null && <ErrorAlert error={error} title="The report could not be created" />}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={routes.settingsTemplates(projectId)}
          className="text-sm text-primary hover:underline"
        >
          Manage templates
        </Link>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void download()}
            loading={busy}
            disabled={value === null}
          >
            {!busy && <Download />}
            Download .xlsx
          </Button>
        </div>
      </div>
    </div>
  );
}
