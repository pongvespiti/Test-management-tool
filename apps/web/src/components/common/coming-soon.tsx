import { Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from './empty-state';
import { PageHeader, type Crumb } from './page-header';

/** Placeholder body for pages that are implemented in a later step. */
export function ComingSoon({
  title,
  subtitle,
  description,
  breadcrumbs,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  description: string;
  breadcrumbs?: Crumb[];
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} />
      {children}
      <Card>
        <EmptyState
          icon={<Wrench className="size-6" strokeWidth={1.6} />}
          title="Coming soon"
          description={description}
        />
      </Card>
    </>
  );
}
