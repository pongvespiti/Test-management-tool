'use client';

import { Layers } from 'lucide-react';
import { ComboboxSelect } from '@/components/common/combobox-select';
import { EmptyState } from '@/components/common/empty-state';
import { QueryState } from '@/components/common/error-alert';
import { Refreshing, SectionCard } from '@/features/reports/report-ui';
import { TopicTree } from '@/features/topics/topic-tree';
import { useTopics } from '@/lib/api/topics';

/** Topics of one person in a release: topic → suite → run → section → case, with progress. */
export function MyTopics({
  projectId,
  userId,
  releaseId,
  onRelease,
  own,
}: {
  projectId: number;
  userId: number;
  releaseId: number | null;
  onRelease: (id: number | null) => void;
  /** The list of the signed-in user (wording only). */
  own: boolean;
}) {
  const query = useTopics(projectId, releaseId, userId);
  const data = query.data;
  const person = data?.user?.displayName ?? '';
  return (
    <SectionCard
      title={own ? 'My topics' : `Topics of ${person}`}
      subtitle="Everything handed out in the release, finished topics included. Open a run to see its sections and cases."
      actions={
        data && data.releases.length > 0 ? (
          <div className="flex items-center gap-2">
            <label
              htmlFor="my-topics-release"
              className="text-sm font-medium text-muted-foreground"
            >
              Release
            </label>
            <ComboboxSelect
              id="my-topics-release"
              className="w-[220px]"
              options={data.releases.map((r) => ({
                value: String(r.id),
                label: r.name,
              }))}
              value={data.release ? String(data.release.id) : null}
              onChange={(v) => onRelease(v ? Number(v) : null)}
              searchable={data.releases.length > 8}
              emptyText="No releases"
            />
          </div>
        ) : undefined
      }
    >
      <QueryState query={query}>
        {data && (
          <Refreshing active={query.isFetching}>
            {data.topics.length === 0 ? (
              <EmptyState
                compact
                icon={<Layers className="size-6" strokeWidth={1.6} />}
                title={own ? 'No topic is handed to you in this release' : 'Nothing handed out'}
                description="A manager or a lead gives suites to people from the Team page."
              />
            ) : (
              <TopicTree projectId={projectId} topics={data.topics} userId={userId} />
            )}
          </Refreshing>
        )}
      </QueryState>
    </SectionCard>
  );
}
