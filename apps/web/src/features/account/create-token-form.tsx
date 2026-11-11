'use client';

import { createTokenSchema, type CreatedTokenDTO } from '@tmt/shared';
import { addDays } from 'date-fns';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { CopyButton } from '@/components/common/copy-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
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
import { useCreateToken } from '@/lib/api/tokens';
import { formatDate } from '@/lib/format';
import { notifyError } from '@/lib/notify';
import { flatResolver, schemaErrors } from '@/lib/form-errors';
import { SegmentedControl } from '@/components/common/list-controls';
import { CodeBlock } from './code-block';
import { junitUploadCommand, whoAmICommand } from './token-examples';

const EXPIRY_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never' },
] as const;

type Expiry = (typeof EXPIRY_OPTIONS)[number]['value'];

interface Values {
  name: string;
  expiry: Expiry;
}

const toBody = (v: Values) => ({
  name: v.name,
  expiresInDays: v.expiry === 'never' ? null : Number(v.expiry),
});

/** "New API token" dialog: the form, then the token shown once with example commands. */
export function CreateTokenForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Called when the token is shown (the dialog should then not close by accident). */
  onCreated?: () => void;
}) {
  const create = useCreateToken();
  const [now] = useState(() => new Date());
  const [created, setCreated] = useState<CreatedTokenDTO | null>(null);
  const form = useForm<Values>({
    defaultValues: { name: '', expiry: '90' },
    resolver: flatResolver((v) =>
      schemaErrors(createTokenSchema, toBody(v), (p) => (p === 'expiresInDays' ? 'expiry' : p)),
    ),
  });
  const expiry = useWatch({ control: form.control, name: 'expiry' });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      setCreated(await create.mutateAsync(toBody(v)));
      onCreated?.();
    } catch (err) {
      notifyError(err, 'Could not create the token');
    }
  });

  if (created) return <TokenCreated token={created} onClose={onClose} />;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Jenkins — ACS nightly JUnit upload"
                  required
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormDescription>
                What the token is for, e.g. the CI job or script that uses it
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="expiry"
          render={({ field }) => (
            <div className="grid gap-2">
              <p id="token-expiry-label" className="text-sm font-medium">
                Expires
              </p>
              <SegmentedControl
                aria-labelledby="token-expiry-label"
                options={EXPIRY_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                size="default"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {expiry === 'never'
                  ? 'The token works until you revoke it. Prefer an expiry for tokens stored in CI systems.'
                  : `The token stops working on ${formatDate(addDays(now, Number(expiry)).toISOString())}.`}
              </p>
            </div>
          )}
        />
        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create token
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function TokenCreated({ token, onClose }: { token: CreatedTokenDTO; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>Copy the token now</AlertTitle>
        <AlertDescription className="block">
          This is the only time it is shown. Store it like a password, e.g. as a secret variable{' '}
          <span className="font-mono">TMT_TOKEN</span> in your CI system. It acts with your project
          roles.
        </AlertDescription>
      </Alert>
      <div>
        <p id="new-token-label" className="mb-1 text-sm font-medium">
          {token.name}
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={token.token}
            readOnly
            aria-labelledby="new-token-label"
            className="flex-1 font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton value={token.token} label="Copy token" />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {token.expiresAt ? `Expires ${formatDate(token.expiresAt)}` : 'Never expires'} · listed as{' '}
          <span className="font-mono">{token.prefix}…</span>
        </p>
      </div>
      <CodeBlock
        label="Try it — who am I?"
        code={whoAmICommand(token.token)}
        copyLabel="Copy command"
      />
      <CodeBlock
        label="Upload JUnit results from CI"
        code={junitUploadCommand()}
        copyLabel="Copy command"
      />
      <DialogFooter>
        <Button onClick={onClose}>I have copied the token</Button>
      </DialogFooter>
    </div>
  );
}
