import { MapPinOff } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { routes } from '@/lib/routes';
import { EmptyState } from './empty-state';

/** Body of the 404 pages. */
export function NotFoundState() {
  return (
    <EmptyState
      icon={<MapPinOff className="size-6" strokeWidth={1.6} />}
      title="Page not found"
      description="The page you opened does not exist or was moved."
      action={
        <Button asChild variant="outline">
          <Link href={routes.home}>Go to start page</Link>
        </Button>
      }
    />
  );
}
