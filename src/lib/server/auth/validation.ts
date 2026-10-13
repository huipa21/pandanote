import type { z } from 'zod';
import { apiError } from '../../shared/domain.ts';
import { translate } from '../../shared/i18n/index.ts';
/** Only fixed schema messages and field names cross the boundary, never values. */
export function fieldValidationResponse(error: z.ZodError): Response {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!fields[field])
      fields[field] =
        issue.code === 'unrecognized_keys'
          ? translate('en', 'err.unexpectedFields')
          : issue.message;
  }
  return Response.json(
    {
      ok: false,
      error: { ...apiError('validation', 'err.checkFields'), fields },
    },
    { status: 400 },
  );
}
