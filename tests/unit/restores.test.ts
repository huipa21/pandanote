import { expect, it } from 'vitest';
import { restoreConfirmSchema } from '../../src/lib/shared/restores.ts';
it('requires exact server candidate identity, a body-only grant and explicit full-replace confirmation', () => {
  const valid = {
    id: '11111111-1111-4111-8111-111111111111',
    grant: 'a'.repeat(43),
    confirmed: true,
  };
  expect(restoreConfirmSchema.parse(valid)).toEqual(valid);
  for (const changed of [
    { ...valid, confirmed: false },
    { ...valid, force: true },
    { ...valid, id: '../escape' },
    { ...valid, grant: 'short' },
    { ...valid, merge: true },
  ])
    expect(restoreConfirmSchema.safeParse(changed).success).toBe(false);
});
