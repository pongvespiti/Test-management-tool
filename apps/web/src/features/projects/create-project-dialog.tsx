'use client';

import { createProjectSchema, DEFAULT_DOC_NO_PATTERN } from '@tmt/shared';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useCreateProject } from '@/lib/api/projects';
import { formResolver } from '@/lib/forms';
import { notifyError, notifySuccess } from '@/lib/notify';
import { routes } from '@/lib/routes';

const EMPTY = { key: '', name: '', description: '', docNoPattern: DEFAULT_DOC_NO_PATTERN };

export function CreateProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateProject();
  const router = useRouter();
  const form = useForm({ resolver: formResolver(createProjectSchema), defaultValues: EMPTY });

  const close = () => {
    form.reset(EMPTY);
    onClose();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const project = await create.mutateAsync(values);
      notifySuccess(`Project ${project.key} created.`);
      close();
      router.push(routes.project(project.id));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PROJECT_KEY_TAKEN') {
        form.setError('key', { message: 'This key is already used by another project' });
      } else {
        notifyError(err, 'Could not create the project');
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project holds the test case library, releases, test plans and defects of one product
            line.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
              <FormField
                control={form.control}
                name="key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input
                        required
                        {...field}
                        onChange={(e) => field.onChange(e.currentTarget.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormDescription>2–10 letters/digits, e.g. ACS</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="ACS Smart control system" required {...field} />
                    </FormControl>
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
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="docNoPattern"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document number pattern</FormLabel>
                  <FormControl>
                    <Input className="font-mono" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>
                    Tokens {'{YY} {YYYY} {MM} {SEQ}'} — used to suggest the next Doc no. of a test
                    plan
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create project
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
