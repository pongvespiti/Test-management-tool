import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface Crumb {
  label: ReactNode;
  href?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  /** Small line above the title (e.g. doc no., project name). */
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Badges next to the eyebrow. */
  badges?: ReactNode;
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  breadcrumbs,
  badges,
}: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {c.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          {(eyebrow || badges) && (
            <div className="flex flex-wrap items-center gap-2.5">
              {eyebrow && (
                <span className="text-sm font-medium text-muted-foreground">{eyebrow}</span>
              )}
              {badges}
            </div>
          )}
          <h1 className="text-2xl leading-8 font-semibold [overflow-wrap:anywhere]">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </header>
  );
}
