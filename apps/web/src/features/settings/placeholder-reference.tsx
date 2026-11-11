'use client';

import { QueryState } from '@/components/common/error-alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTemplatePlaceholders } from '@/lib/api/templates';
import { PlaceholderList } from './placeholder-list';
import { describePlaceholder, PLACEHOLDER_GROUPS, type PlaceholderNames } from './placeholder-info';

/** Every placeholder of this project (`GET templates/placeholders`), grouped, click to copy. */
export function PlaceholderReference({
  projectId,
  names,
}: {
  projectId: number;
  names: PlaceholderNames;
}) {
  const reference = useTemplatePlaceholders(projectId);
  return (
    <Card className="gap-1 px-5">
      <h2 className="font-semibold">Placeholder reference</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Click a placeholder to copy it, then paste it into a cell of the form. Custom fields,
        environment labels and summary groups come from this project&apos;s suites.
      </p>
      <QueryState query={reference}>
        {reference.data && (
          <Tabs defaultValue="workbook">
            <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
              {PLACEHOLDER_GROUPS.map((g) => (
                <TabsTrigger key={g.key} value={g.key} className="flex-none">
                  {g.label}
                  <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                    {reference.data[g.key].length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            {PLACEHOLDER_GROUPS.map((g) => (
              <TabsContent key={g.key} value={g.key} className="pt-1">
                <p className="mb-2 text-sm">{g.hint}</p>
                {reference.data[g.key].length === 0 ? (
                  <p className="text-sm text-muted-foreground">None for this project.</p>
                ) : (
                  <PlaceholderList
                    items={reference.data[g.key].map((p) => ({
                      value: p,
                      description: describePlaceholder(p, names) ?? '—',
                    }))}
                  />
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </QueryState>
    </Card>
  );
}
