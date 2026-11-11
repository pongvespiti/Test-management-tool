import { REQUIREMENT_SOURCE_LABELS, type RequirementSource } from '@tmt/shared';
import { StatusPill } from '@/components/common/status-pill';
import { REQUIREMENT_SOURCE_TONES } from './requirement-format';

export function RequirementSourceBadge({ source }: { source: RequirementSource }) {
  return (
    <StatusPill tone={REQUIREMENT_SOURCE_TONES[source]}>
      {REQUIREMENT_SOURCE_LABELS[source]}
    </StatusPill>
  );
}
