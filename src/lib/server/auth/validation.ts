import type { z } from 'zod';
/** Only fixed schema messages and field names cross the boundary, never values. */
export function fieldValidationResponse(error: z.ZodError): Response {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!fields[field])
      fields[field] =
        issue.code === 'unrecognized_keys'
          ? 'Unexpected fields.'
          : issue.message;
  }
  return Response.json(
    {
      ok: false,
      error: {
        code: 'validation',
        message: 'Check the highlighted fields.',
        fields,
      },
    },
    { status: 400 },
  );
}
