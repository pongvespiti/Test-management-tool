'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { routes } from '@/lib/routes';
import { AppSidebar } from './app-sidebar';
import { GlobalSearch } from './global-search';
import { Logo } from './logo';
import { NotificationBell } from './notification-bell';
import { ProjectSwitcher } from './project-switcher';
import { UserMenu } from './user-menu';

/** Header (61px) + left navigation (240px) + content, as in the approved mockup. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The mobile navigation is open for the page it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const mobileOpen = openOn === pathname;
  const setMobileOpen = (open: boolean) => setOpenOn(open ? pathname : null);

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print fixed inset-x-0 top-0 z-40 h-[61px] border-b bg-card">
        <div className="flex h-full items-center gap-4 px-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <Link
            href={routes.home}
            aria-label="Test Management home"
            className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Logo />
          </Link>
          <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
            <ProjectSwitcher />
            <Suspense fallback={<div className="flex-[1_1_240px]" />}>
              <GlobalSearch />
            </Suspense>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>

      <aside className="no-print fixed top-[61px] bottom-0 left-0 z-30 hidden w-60 border-r bg-sidebar sm:block">
        <AppSidebar />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Project switcher and pages</SheetDescription>
          <div className="border-b p-3 pr-12">
            <ProjectSwitcher />
          </div>
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="pt-[61px] sm:pl-60 print:p-0">
        <div className="max-w-[1680px] p-[clamp(16px,2.5vw,28px)] pb-12">{children}</div>
      </main>
    </div>
  );
}
