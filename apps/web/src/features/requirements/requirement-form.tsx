'use client';

import { createRequirementSchema, type RequirementDTO } from '@tmt/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { useCreateRequirement, useUpdateRequirement } from '@/lib/api/requirements';
import { schemaErrors } from '@/lib/form-errors';
import { notifyError, notifySuccess } from '@/lib/notify';
import { useProject } from '@/providers/project-provider';

const FIELD = 'flex flex-col gap-1.5';
const LABEL = 'text-sm font-medium';

/** Type in a requirement, or edit one (a Jira requirement keeps the text Jira gave it). */
export function RequirementForm({
  requirement,
  onClose,
  onSaved,
}: {
  requirement: RequirementDTO | null;
  onClose: () => void;
  onSaved?: (saved: RequirementDTO) => void;
}) {
  const { projectId } = useProject();
  const create = useCreateRequirement(projectId);
  const update = useUpdateRequirement(projectId);
  const fromJira = requirement?.source === 'jira';
  const [key, setKey] = useState(requirement?.key ?? '');
  const [title, setTitle] = useState(requirement?.title ?? '');
  const [description, setDescription] = useState(requirement?.description ?? '');
  const [sourceRef, setSourceRef] = useState(requirement?.sourceRef ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const body = { key, title, description, sourceRef };
    const found = schemaErrors(createRequirementSchema, body);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setErrors({});
    try {
      const saved = requirement
        ? await update.mutateAsync({
            requirementId: requirement.id,
            ...(fromJira ? { sourceRef } : body),
          })
        : await create.mutateAsync(body);
      notifySuccess(requirement ? `${saved.key} saved.` : `Requirement ${saved.key} added.`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REQUIREMENT_KEY_TAKEN')
        setErrors({ key: 'Another requirement has this ID' });
      else notifyError(err, 'Could not save the requirement');
    }
  };

  const error = (name: string) =>
    errors[name] ? <p className="text-sm text-destructive">{errors[name]}</p> : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{requirement ? `Edit ${requirement.key}` : 'New requirement'}</DialogTitle>
          <DialogDescription>
            {fromJira
              ? 'The ID, title and description come from Jira. Read from Jira again to refresh them.'
              : 'Test cases cite a requirement by writing its ID in their References field.'}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className={FIELD}>
            <label htmlFor="req-key" className={LABEL}>
              ID
            </label>
            <Input
              id="req-key"
              autoFocus={!requirement}
              value={key}
              disabled={fromJira}
              onChange={(e) => setKey(e.target.value)}
              placeholder="REQ-12, IOT-345, 3.2.1 …"
              aria-invalid={!!errors.key}
              className="font-mono"
            />
            {error('key')}
          </div>
          <div className={FIELD}>
            <label htmlFor="req-title" className={LABEL}>
              Title
            </label>
            <Input
              id="req-title"
              value={title}
              disabled={fromJira}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!errors.title}
            />
            {error('title')}
          </div>
          <div className={FIELD}>
            <label htmlFor="req-description" className={LABEL}>
              Description
            </label>
            <Textarea
              id="req-description"
              rows={5}
              value={description}
              disabled={fromJira}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={!!errors.description}
            />
            {error('description')}
          </div>
          <div className={FIELD}>
            <label htmlFor="req-source-ref" className={LABEL}>
              Source document
            </label>
            <Input
              id="req-source-ref"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              placeholder="Spec v3 §4.1, meeting minutes 2026-10-01 …"
              aria-invalid={!!errors.sourceRef}
            />
            <p className="text-xs text-muted-foreground">
              Where the full text lives when it is a PDF or minutes — written here as a reference.
            </p>
            {error('sourceRef')}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {requirement ? 'Save' : 'Add requirement'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
