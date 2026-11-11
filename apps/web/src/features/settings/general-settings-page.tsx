'use client';

import { updateProjectSchema, type ProjectDTO, type UpdateProjectInput } from '@tmt/shared';
import { Archive, ArchiveRestore, Info, Lock } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { confirmAction } from '@/components/common/confirm-host';
import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePlanDocNos, useUpdateProject, type UpdateProjectBody } from '@/lib/api/projects';
import { formatDateTime } from '@/lib/format';
import { formResolver } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useProject } from '@/providers/project-provider';
import { DocNoPatternField } from './doc-no-pattern-field';
import { applyValidationIssues } from './server-errors';

interface Values {
  name: string;
  description: string;
  docNoPattern: string;
  requireCaseReview: boolean;
}

const toValues = (p: ProjectDTO): Values => ({
  name: p.name,
  description: p.description ?? '',
  docNoPattern: p.docNoPattern,
  requireCaseReview: p.requireCaseReview,
});

const REVIEW_RULES = [
  'Only leads can set a test case to Ready — directly or by approving a review.',
  null, // the Reviews page link
  'Cases that testers create or import as Ready are saved as Draft instead.',
  'When a tester changes the content of a Ready case (title, precondition, procedure, expected result, steps or custom fields), it goes back to Draft.',
  'Cases that are already Ready stay Ready when you turn this on.',
];

export function GeneralSettingsPage() {
  const { project, can } = useProject();
  // PATCH /projects/:id is lead-only on the server (same rule as managing members).
  const canEdit = can('manageMembers');
  return (
    <>
      <PageHeader
        title="Project settings"
        subtitle={`${project.name} · name, document numbers and review rules${canEdit ? '' : ' (read only — leads can change them)'}`}
      />
      <ProjectSettingsForm key={project.id} project={project} readOnly={!canEdit} />
    </>
  );
}

function ProjectSettingsForm({ project, readOnly }: { project: ProjectDTO; readOnly: boolean }) {
  const update = useUpdateProject(project.id);
  const docNos = usePlanDocNos(project.id);
  const form = useForm<UpdateProjectBody, unknown, UpdateProjectInput>({
    resolver: formResolver(updateProjectSchema),
    defaultValues: toValues(project),
  });
  const dirty = form.formState.isDirty;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(values);
      form.reset(toValues(saved));
      notifySuccess('Project settings saved.');
    } catch (err) {
      if (!applyValidationIssues(err, form.setError))
        notifyError(err, 'Could not save the settings');
    }
  });

  const setArchived = (isArchived: boolean) => {
    const run = async () => {
      try {
        await update.mutateAsync({ isArchived });
        notifySuccess(isArchived ? `${project.key} archived.` : `${project.key} restored.`);
      } catch (err) {
        notifyError(err, isArchived ? 'Could not archive the project' : 'Could not restore it');
      }
    };
    if (!isArchived) return void run();
    confirmAction({
      title: `Archive ${project.key}?`,
      message:
        'Nothing is deleted: the project stays readable for its members and you can restore it at any time. It is greyed out on the Projects page and no longer opened automatically.',
      confirmLabel: 'Archive project',
      danger: true,
      onConfirm: run,
    });
  };

  return (
    <div className="flex max-w-[960px] flex-col gap-6">
      {project.isArchived && (
        <Alert className="bg-secondary">
          <Archive />
          <AlertTitle>Archived</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              This project is archived. It stays readable; restore it to show it among the active
              projects again.
            </span>
            {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                loading={update.isPending}
                onClick={() => setArchived(false)}
              >
                <ArchiveRestore />
                Restore project
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {readOnly && (
        <Alert variant="info">
          <Lock />
          <AlertDescription>Only project leads can change these settings.</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <Card className="gap-4 px-5">
            <h2 className="font-semibold">Project</h2>
            <div className="flex flex-wrap items-start gap-4">
              <div className="grid w-40 gap-2">
                <Label htmlFor="project-key">Key</Label>
                <Input id="project-key" value={project.key} readOnly className="font-mono" />
                <p className="text-xs text-muted-foreground">Cannot be changed</p>
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="min-w-[260px] flex-1">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        required={!readOnly}
                        readOnly={readOnly}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>Shown in the header and on exported reports</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea readOnly={readOnly} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Card>

          <Card className="gap-1 px-5">
            <h2 className="font-semibold">Document numbers</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              New test plans get a suggested document number from this pattern, e.g. the team&apos;s{' '}
              <span className="font-mono">26TR-TEAM-10-61</span>.
            </p>
            <FormField
              control={form.control}
              name="docNoPattern"
              render={({ field, fieldState }) => (
                <DocNoPatternField
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  error={fieldState.error?.message}
                  readOnly={readOnly}
                  docNos={docNos.data ?? null}
                />
              )}
            />
          </Card>

          <Card className="gap-1 px-5">
            <h2 className="font-semibold">Test case review</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Decide whether test cases need a lead&apos;s approval before they can be used as
              Ready.
            </p>
            <FormField
              control={form.control}
              name="requireCaseReview"
              render={({ field }) => (
                <FormItem className="flex items-start gap-3">
                  <FormControl>
                    <Switch
                      checked={field.value === true}
                      onCheckedChange={field.onChange}
                      disabled={readOnly}
                      className="mt-0.5"
                    />
                  </FormControl>
                  <div className="grid gap-1">
                    <FormLabel>Require review before cases are Ready</FormLabel>
                    <FormDescription>
                      {field.value
                        ? 'On — only leads make cases Ready.'
                        : 'Off — testers can mark cases Ready themselves.'}
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <Alert className="mt-4 bg-secondary">
              <Info />
              <AlertTitle>When review is required</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {REVIEW_RULES.map((rule, i) =>
                    rule ? (
                      <li key={i}>{rule}</li>
                    ) : (
                      <li key={i}>
                        Testers submit cases for review; leads approve them or request changes on
                        the{' '}
                        <Link
                          href={routes.reviews(project.id)}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          Reviews
                        </Link>{' '}
                        page.
                      </li>
                    ),
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          </Card>

          {!readOnly && (
            <Card
              className={cn(
                'flex-row flex-wrap items-center justify-between gap-3 px-5 py-3',
                // Sticks to the bottom only while there is something to save.
                dirty && 'sticky bottom-4 z-[5] shadow-md',
              )}
            >
              <p className={cn('text-sm', !dirty && 'text-muted-foreground')}>
                {dirty
                  ? 'You have unsaved changes.'
                  : `All changes saved · last update ${formatDateTime(project.updatedAt)}`}
              </p>
              <div className="flex gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!dirty}
                  onClick={() => form.reset()}
                >
                  Discard
                </Button>
                <Button type="submit" disabled={!dirty} loading={update.isPending}>
                  Save settings
                </Button>
              </div>
            </Card>
          )}
        </form>
      </Form>

      {!readOnly && !project.isArchived && (
        <Card className="flex-row flex-wrap items-start justify-between gap-4 border-[#ffc9c9] px-5">
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 className="font-semibold">Archive project</h2>
            <p className="text-sm text-muted-foreground">
              For finished product lines. Nothing is deleted and members can still read everything;
              the project is greyed out on the Projects page. You can restore it at any time.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setArchived(true)}
          >
            <Archive />
            Archive project
          </Button>
        </Card>
      )}
    </div>
  );
}
