import type { ProjectRole } from '@tmt/shared';
import { RoleBadge } from '@/components/common/badges';
import { Card } from '@/components/ui/card';

const ROWS: { role: ProjectRole; text: string }[] = [
  { role: 'viewer', text: 'Read everything in the project and export test cases and reports.' },
  {
    role: 'manager',
    text: 'Reads everything like a viewer, and also sees the Team page and assigns test topics to people and sets due dates. Does not record results or edit test cases.',
  },
  {
    role: 'tester',
    text: 'Also write test cases and shared steps, import from Excel or JUnit, create plans and runs, record results, report defects, use Jira and comment.',
  },
  {
    role: 'lead',
    text: 'Also the team view and topic assignment of a manager, and manage suites and fields, releases, members, report templates, integrations and project settings, approve reviews, delete items and reopen completed plans.',
  },
];

/** Short explanation of what each project role may do (mirrors PERMISSIONS in @tmt/shared). */
export function RolesHelp() {
  return (
    <Card className="gap-3 px-5">
      <h2 className="font-semibold">Roles</h2>
      <div className="flex flex-col gap-2">
        {ROWS.map((r) => (
          <div key={r.role} className="flex items-start gap-3">
            <div className="w-[72px] flex-none">
              <RoleBadge role={r.role} />
            </div>
            <p className="text-sm text-muted-foreground">{r.text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
