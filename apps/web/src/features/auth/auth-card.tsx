import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/logo';
import { Card, CardContent } from '@/components/ui/card';

/** Centered card on the grey page background, used by the login and password pages. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex justify-center">
          <Logo size={36} />
        </div>
        <Card className="rounded-2xl py-8">
          <CardContent className="flex flex-col gap-4 px-8">
            <div>
              <h1 className="text-xl font-bold">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
