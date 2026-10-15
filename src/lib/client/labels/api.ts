import type { ApiResult } from '#lib/shared/domain.ts';
import type {
  LabelCommand,
  LabelMutationResult,
  LabelPage,
} from '#lib/shared/labels.ts';

/**
 * Sends one label command. The caller owns `mutationId`: reuse it when retrying the
 * same content so a lost response cannot create a second label.
 */
export async function sendLabelCommand(
  command: LabelCommand,
): Promise<ApiResult<LabelMutationResult>> {
  const url =
    command.action === 'create'
      ? '/api/labels'
      : `/api/labels/${encodeURIComponent(command.labelId)}${
          command.action === 'delete' ? '/delete' : ''
        }`;
  const response = await fetch(url, {
    method: command.action === 'update' ? 'PATCH' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(15_000),
  });
  return (await response.json()) as ApiResult<LabelMutationResult>;
}

/** The whole private list (no paging: at most MAX_LABELS rows). */
export async function loadLabels(
  signal?: AbortSignal,
): Promise<ApiResult<LabelPage>> {
  const response = await fetch('/api/labels', {
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  return (await response.json()) as ApiResult<LabelPage>;
}
