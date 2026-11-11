'use client';

import type { ImportResultDTO } from '@tmt/shared';
import { ArrowRight, CircleCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatNumber, pluralize } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p
        className={cn(
          'text-[22px] leading-tight font-bold',
          value === 0 && 'text-muted-foreground',
        )}
      >
        {formatNumber(value)}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Step 6: what the import did, with a link to the suite. */
export function ResultStep({
  result,
  suiteName,
  onAnother,
}: {
  result: ImportResultDTO;
  suiteName: string;
  onAnother: () => void;
}) {
  const { projectId } = useProject();
  return (
    <Card className="items-start gap-6 px-5">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#ebfbee] text-success"
        >
          <CircleCheck className="size-7" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Import finished</h2>
          <p className="text-sm text-muted-foreground">
            Into “{suiteName}”
            {result.warnings.length > 0
              ? ` · ${pluralize(result.warnings.length, 'warning')} (see the preview)`
              : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-5">
        <Figure label="cases created" value={result.created} />
        <Figure label="cases updated" value={result.updated} />
        <Figure label="rows skipped" value={result.skipped} />
        <Figure label="sections created" value={result.sectionsCreated} />
        <Figure label="custom fields created" value={result.fieldsCreated} />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button asChild>
          <Link href={routes.cases(projectId, { suite: result.suiteId })}>
            Open the suite
            <ArrowRight />
          </Link>
        </Button>
        <Button variant="outline" onClick={onAnother}>
          <Upload />
          Import another file
        </Button>
      </div>
    </Card>
  );
}
