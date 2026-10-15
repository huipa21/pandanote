import type { ApiResult } from '#lib/shared/domain.ts';
import type {
  TemplateCommand,
  TemplateMutationResult,
  TemplatePage,
} from '#lib/shared/templates.ts';

/**
 * Sends one template command. The caller owns `mutationId`: reuse it when retrying the
 * same content so a lost response cannot create a second template.
 */
export async function sendTemplateCommand(
  command: TemplateCommand,
): Promise<ApiResult<TemplateMutationResult>> {
  const url =
    command.action === 'create'
      ? '/api/templates'
      : `/api/templates/${encodeURIComponent(command.templateId)}${
          command.action === 'delete' ? '/delete' : ''
        }`;
  const response = await fetch(url, {
    method: command.action === 'update' ? 'PATCH' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(15_000),
  });
  return (await response.json()) as ApiResult<TemplateMutationResult>;
}

/** The whole private list (no paging: single-user and no template limit). */
export async function loadTemplates(
  signal?: AbortSignal,
): Promise<ApiResult<TemplatePage>> {
  const response = await fetch('/api/templates', {
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  return (await response.json()) as ApiResult<TemplatePage>;
}
