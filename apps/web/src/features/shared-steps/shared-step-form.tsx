'use client';

import type { SharedStepDTO } from '@tmt/shared';
import { Info, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import {
  useCreateSharedStep,
  useFetchSharedStep,
  useUpdateSharedStep,
} from '@/lib/api/shared-steps';
import { pluralize } from '@/lib/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';
import type { EditorStep } from '@/features/cases/case-form-model';
import { errorAt, flatResolver } from '@/lib/form-errors';
import { StepsEditor } from '@/features/cases/steps-editor';
import {
  MAX_SHARED_STEPS,
  toSharedStepBody,
  toSharedStepValues,
  validateSharedStepForm,
  type SharedStepFormValues,
} from './shared-step-model';

const resolver = flatResolver(validateSharedStepForm);

/** Create or edit a shared step set (name, description, ordered plain steps). Version-checked. */
export function SharedStepForm({
  sharedStep,
  onDone,
}: {
  /** null = new shared steps. */
  sharedStep: SharedStepDTO | null;
  onDone: (saved?: SharedStepDTO) => void;
}) {
  const { projectId } = useProject();
  const create = useCreateSharedStep(projectId);
  const update = useUpdateSharedStep(projectId);
  const fetchSharedStep = useFetchSharedStep(projectId);
  const [version, setVersion] = useState(sharedStep?.version);
  const [usage, setUsage] = useState(sharedStep?.usageCount ?? 0);
  const [conflict, setConflict] = useState(false);
  const form = useForm<SharedStepFormValues>({
    defaultValues: toSharedStepValues(sharedStep),
    resolver,
  });
  const steps = useWatch({ control: form.control, name: 'steps' }) as EditorStep[];
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    const body = toSharedStepBody(values);
    try {
      const saved = sharedStep
        ? await update.mutateAsync({ id: sharedStep.id, version, ...body })
        : await create.mutateAsync(body);
      notifySuccess(
        sharedStep
          ? `“${saved.name}” saved${saved.usageCount > 0 ? ` — ${pluralize(saved.usageCount, 'case')} use the new steps` : ''}.`
          : `Shared steps “${saved.name}” created.`,
      );
      onDone(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') setConflict(true);
      else if (err instanceof ApiError && err.code === 'SHARED_STEP_NAME_TAKEN')
        form.setError('name', { message: 'Another shared step set has this name' });
      else notifyError(err, 'Could not save the shared steps');
    }
  });

  const loadLatest = async () => {
    if (!sharedStep) return;
    try {
      const latest = await fetchSharedStep(sharedStep.id);
      form.reset(toSharedStepValues(latest));
      setVersion(latest.version);
      setUsage(latest.usageCount);
      setConflict(false);
    } catch (err) {
      notifyError(err, 'Could not load the latest version');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {conflict && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>Changed by someone else</AlertTitle>
            <AlertDescription>
              <p>
                Another person saved these shared steps while you were editing. Load their version
                to continue (copy your text first if you need it), or cancel.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-1 bg-warning text-white hover:bg-warning/90"
                onClick={() => void loadLatest()}
              >
                Load latest version
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {sharedStep && usage > 0 && (
          <Alert variant="info">
            <Info />
            <AlertDescription>
              Used by {pluralize(usage, 'test case')}. Your changes apply to all of them; runs that
              were already created keep their own copy of the steps.
            </AlertDescription>
          </Alert>
        )}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Log in to the ACS app" required autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormDescription>
                Optional — when to use these steps, test data, prerequisites
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Steps</p>
          <StepsEditor
            steps={steps}
            onChange={(apply) => {
              form.setValue('steps', apply(form.getValues('steps')), { shouldDirty: true });
              form.clearErrors('steps');
            }}
            errorFor={(i, field) => errorAt(errors, `steps.${i}.${field}`)}
            error={errorAt(errors, 'steps')}
            max={MAX_SHARED_STEPS}
          />
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onDone()}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending} disabled={conflict}>
            {sharedStep ? 'Save' : 'Create shared steps'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
