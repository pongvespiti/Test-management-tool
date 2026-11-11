'use client';

import type { JiraConfigDTO } from '@tmt/shared';
import { CircleCheck, CircleX, PlugZap, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { confirmAction } from '@/components/common/confirm-host';
import { PasswordInput } from '@/components/common/password-input';
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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useDeleteJiraConfig, useSaveJiraConfig, useTestJira } from '@/lib/api/integrations';
import { formatDateTime } from '@/lib/format';
import { errorMessage, notifyError, notifySuccess } from '@/lib/notify';
import { flatResolver } from '@/lib/form-errors';
import {
  jiraFormErrors,
  storedSecretUsable,
  toJiraBody,
  toJiraValues,
  type JiraFormValues,
} from './jira-settings';
import { applyValidationIssues, errorCode } from './server-errors';

interface TestOutcome {
  ok: boolean;
  title: string;
  message: string;
  /** Form values the test ran with: any change hides the result. */
  values: string;
}

const AUTH_CHOICES = [
  { value: 'pat', title: 'Personal access token', hint: 'Jira Server / Data Center' },
  { value: 'basic', title: 'E-mail + API token', hint: 'Jira Cloud (atlassian.net)' },
] as const;

/** On/off switch with a label and an explanation. */
function SwitchRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <FormItem className="flex items-start gap-3">
      <FormControl>
        <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      </FormControl>
      <div className="grid gap-1">
        <FormLabel>{label}</FormLabel>
        <FormDescription>{description}</FormDescription>
      </div>
    </FormItem>
  );
}

/** Jira connection settings for leads: test, save, remove (ADR-008). */
export function JiraSettingsForm({
  projectId,
  config,
}: {
  projectId: number;
  config: JiraConfigDTO | null;
}) {
  const save = useSaveJiraConfig(projectId);
  const remove = useDeleteJiraConfig(projectId);
  const test = useTestJira(projectId);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [stored, setStored] = useState(config);

  const form = useForm<JiraFormValues>({
    defaultValues: toJiraValues(config),
    resolver: flatResolver((v) => jiraFormErrors(v, stored)),
  });
  const values = useWatch({ control: form.control });
  // A test result belongs to the values it was run with.
  const shownOutcome = outcome?.values === JSON.stringify(values) ? outcome : null;

  const isBasic = values.authType === 'basic';
  const storedUsable = storedSecretUsable(stored, values.baseUrl ?? '');

  const runTest = async () => {
    if (!(await form.trigger())) return;
    const tested = form.getValues();
    const snapshot = JSON.stringify(tested);
    try {
      const r = await test.mutateAsync(toJiraBody(tested));
      const details = [
        r.serverTitle ? `Server: ${r.serverTitle}` : null,
        r.projectName ? `Project: ${r.projectName}` : null,
      ].filter(Boolean);
      setOutcome(
        r.ok
          ? {
              ok: true,
              title: 'Connected',
              message: r.message || details.join(' · '),
              values: snapshot,
            }
          : { ok: false, title: 'Connection failed', message: r.message, values: snapshot },
      );
    } catch (err) {
      applyValidationIssues(err, form.setError);
      setOutcome({
        ok: false,
        title: 'Connection failed',
        message: errorMessage(err),
        values: snapshot,
      });
    }
  };

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const saved = await save.mutateAsync(toJiraBody(v));
      setStored(saved);
      form.reset(toJiraValues(saved));
      notifySuccess(saved.enabled ? 'Jira settings saved.' : 'Jira settings saved (turned off).');
    } catch (err) {
      if (errorCode(err) === 'SECRET_REQUIRED')
        form.setError('secret', { message: errorMessage(err) });
      else if (!applyValidationIssues(err, form.setError))
        notifyError(err, 'Could not save the Jira settings');
    }
  });

  const onRemove = () =>
    confirmAction({
      title: 'Remove the Jira connection?',
      message:
        'The settings and the stored token are deleted. Defects keep the Jira keys already linked to them, but nothing can be created or synced until Jira is set up again.',
      confirmLabel: 'Remove connection',
      danger: true,
      onConfirm: async () => {
        try {
          await remove.mutateAsync();
          setStored(null);
          form.reset(toJiraValues(null));
          setOutcome(null);
          notifySuccess('Jira connection removed.');
        } catch (err) {
          notifyError(err, 'Could not remove the Jira connection');
        }
      },
    });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <SwitchRow
              checked={field.value}
              onChange={field.onChange}
              label="Enabled"
              description="Testers can create Jira issues from defects, link existing issues and sync their status."
            />
          )}
        />
        <FormField
          control={form.control}
          name="baseUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Jira URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://jira.example.com  or  https://your-site.atlassian.net"
                  required
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Address of your Jira site, without /browse/… or /rest/…
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="projectKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project key</FormLabel>
                <FormControl>
                  <Input
                    placeholder="TEAM"
                    required
                    className="font-mono"
                    {...field}
                    onChange={(e) => field.onChange(e.currentTarget.value.toUpperCase())}
                  />
                </FormControl>
                <FormDescription>Jira project for new issues</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="issueType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Issue type</FormLabel>
                <FormControl>
                  <Input placeholder="Bug" required {...field} />
                </FormControl>
                <FormDescription>Type of the created issues</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="authType"
          render={({ field }) => (
            <div className="grid gap-2">
              <p id="jira-auth-label" className="text-sm font-medium">
                Authentication
              </p>
              <RadioGroup
                aria-labelledby="jira-auth-label"
                value={field.value}
                onValueChange={field.onChange}
                className="grid gap-3 sm:grid-cols-2"
              >
                {AUTH_CHOICES.map((c) => (
                  <Label
                    key={c.value}
                    htmlFor={`jira-auth-${c.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3 leading-normal font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/50"
                  >
                    <RadioGroupItem
                      value={c.value}
                      id={`jira-auth-${c.value}`}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-semibold">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">{c.hint}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
          )}
        />

        {isBasic && (
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Atlassian account e-mail</FormLabel>
                <FormControl>
                  <Input placeholder="name@company.com" required autoComplete="off" {...field} />
                </FormControl>
                <FormDescription>The account the API token belongs to</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="secret"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isBasic ? 'API token' : 'Personal access token'}</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  placeholder={storedUsable ? '•••••• stored' : undefined}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {storedUsable
                  ? 'Leave blank to keep the stored token; type a new one to replace it.'
                  : stored?.hasSecret
                    ? 'The stored token is only sent to the Jira server it was saved for — enter it for this URL.'
                    : 'Stored encrypted on the TMT server and never shown again.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="verifyTls"
          render={({ field }) => (
            <SwitchRow
              checked={field.value}
              onChange={field.onChange}
              label="Verify the server's TLS certificate"
              description="Keep this on. Turn it off only for a Jira server whose certificate the TMT server does not trust."
            />
          )}
        />
        {values.verifyTls === false && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription className="block">
              Certificate checks are off for this Jira server, so the connection could be
              intercepted. Prefer installing your company&apos;s CA certificate on the TMT server (
              <span className="font-mono">NODE_EXTRA_CA_CERTS</span>) and keep verification on.
            </AlertDescription>
          </Alert>
        )}

        {shownOutcome && (
          <Alert variant={shownOutcome.ok ? 'success' : 'destructive'} role="status">
            {shownOutcome.ok ? <CircleCheck /> : <CircleX />}
            <AlertTitle>{shownOutcome.title}</AlertTitle>
            {shownOutcome.message && <AlertDescription>{shownOutcome.message}</AlertDescription>}
          </Alert>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {stored
              ? `Last saved ${formatDateTime(stored.updatedAt)}${
                  stored.updatedBy ? ` by ${stored.updatedBy.displayName}` : ''
                }`
              : 'Not saved yet'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {stored && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onRemove}
                loading={remove.isPending}
              >
                {!remove.isPending && <Trash2 />}
                Remove
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => void runTest()}
              loading={test.isPending}
            >
              {!test.isPending && <PlugZap />}
              Test connection
            </Button>
            <Button
              type="submit"
              loading={save.isPending}
              disabled={stored !== null && !form.formState.isDirty}
            >
              Save
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
