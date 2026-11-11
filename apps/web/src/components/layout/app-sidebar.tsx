'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useOptionalProject } from '@/providers/project-provider';
import { isNavItemActive, navSections, type NavSection } from './nav-config';

function SidebarSection({
  section,
  pathname,
  onNavigate,
}: {
  section: NavSection;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <div className="px-3 pt-4 pb-1.5 text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
        {section.title}
      </div>
      <ul className="flex flex-col gap-0.5">
        {section.items.map((item) => {
          const active = isNavItemActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                    : 'font-medium text-sidebar-foreground hover:bg-muted',
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Left navigation: project sections inside a project, the workspace otherwise. */
export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const project = useOptionalProject();
  const { isAdmin } = useAuth();
  const sections = navSections(
    project?.projectId ?? null,
    isAdmin,
    project?.can('viewTeam') ?? false,
  );

  return (
    <ScrollArea className="h-full">
      <nav aria-label="Main" className="flex flex-col gap-1 p-3 pb-8">
        {sections.map((section) => (
          <SidebarSection
            key={section.title}
            section={section}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </ScrollArea>
  );
}
