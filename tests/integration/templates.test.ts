import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { withPersistence, seedAccount } from '../helpers/persistence.ts';
import { TemplateService } from '../../src/lib/server/templates/service.ts';
import { DomainError } from '../../src/lib/shared/domain.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import {
  appSettings,
  noteTemplates,
  sessions,
} from '../../src/lib/server/db/schema.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import { SCHEMA_VERSION } from '../../src/lib/server/db/migrations.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';

function identity(p: Persistence): SessionIdentity {
  const id = seedAccount(p);
  const sessionHash = 'c'.repeat(64);
  const expiresAt = Date.now() + 3_600_000;
  p.write((tx) =>
    tx
      .insert(sessions)
      .values({
        tokenHash: sessionHash,
        accountId: id,
        securityRevision: 1,
        expiresAt,
        createdAt: Date.now(),
      })
      .run(),
  );
  return {
    account: { id, mfaEnabled: false },
    sessionHash,
    securityRevision: 1,
    expiresAt,
  };
}

const create = (
  name: string,
  bodyMarkdown = `Body of ${name}`,
  mutationId = randomUUID(),
) => ({
  action: 'create' as const,
  mutationId,
  name,
  bodyMarkdown,
});

function expectDomain(action: () => unknown, code: string, key: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    expect((error as DomainError).messageKey).toBe(key);
    return;
  }
  throw new Error('expected a DomainError');
}

describe('templates service', () => {
  it('creates, lists sorted by name, updates and deletes', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      const b = service.mutate(who, create('Beta'));
      const a = service.mutate(who, create('alpha'));
      expect(b).toMatchObject({ revision: 1, deleted: false });

      const list = service.list(who).items;
      expect(list.map((item) => item.name)).toEqual(['alpha', 'Beta']);
      expect(list[0].id).toBe(a.templateId);

      const renamed = service.mutate(who, {
        action: 'update',
        mutationId: randomUUID(),
        templateId: a.templateId,
        expectedRevision: 1,
        name: 'Alpha review',
        bodyMarkdown: 'New text',
      });
      expect(renamed).toEqual({
        templateId: a.templateId,
        revision: 2,
        deleted: false,
      });
      expect(service.list(who).items[0]).toMatchObject({
        name: 'Alpha review',
        bodyMarkdown: 'New text',
        revision: 2,
      });

      const removed = service.mutate(who, {
        action: 'delete',
        mutationId: randomUUID(),
        templateId: b.templateId,
        expectedRevision: 1,
        confirmed: true,
      });
      expect(removed).toMatchObject({ deleted: true, revision: 2 });
      expect(service.list(who).items.map((item) => item.name)).toEqual([
        'Alpha review',
      ]);
    });
  });

  it('keeps names unique case-insensitively, including on rename', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      const first = service.mutate(who, create('Journal'));
      service.mutate(who, create('Other'));
      expectDomain(
        () => service.mutate(who, create('  JOURNAL ')),
        'validation',
        'err.templateNameExists',
      );
      expectDomain(
        () =>
          service.mutate(who, {
            action: 'update',
            mutationId: randomUUID(),
            templateId: first.templateId,
            expectedRevision: 1,
            name: 'other',
            bodyMarkdown: 'x',
          }),
        'validation',
        'err.templateNameExists',
      );
      // Keeping its own name while changing the body is allowed.
      expect(
        service.mutate(who, {
          action: 'update',
          mutationId: randomUUID(),
          templateId: first.templateId,
          expectedRevision: 1,
          name: 'journal',
          bodyMarkdown: 'Changed',
        }).revision,
      ).toBe(2);
    });
  });

  it('applies the body and name rules before writing', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      expectDomain(
        () => service.mutate(who, create('')),
        'validation',
        'err.templateNameInvalid',
      );
      expectDomain(
        () => service.mutate(who, create('Blank', '  \n\t ')),
        'validation',
        'err.templateBodyRequired',
      );
      expectDomain(
        () => service.mutate(who, create('Image', '![p](attachment:abc)')),
        'validation',
        'err.templateAttachmentReference',
      );
      const limit = DEFAULT_SETTINGS.markdownMaxBytes;
      expectDomain(
        () => service.mutate(who, create('Huge', 'x'.repeat(limit + 1))),
        'validation',
        'err.templateBodyTooLarge',
      );
      expect(service.list(who).items).toEqual([]);
    });
  });

  it('refuses a stale update or delete and never overwrites newer content', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      const made = service.mutate(who, create('Plan'));
      service.mutate(who, {
        action: 'update',
        mutationId: randomUUID(),
        templateId: made.templateId,
        expectedRevision: 1,
        name: 'Plan',
        bodyMarkdown: 'Newer text',
      });
      expectDomain(
        () =>
          service.mutate(who, {
            action: 'update',
            mutationId: randomUUID(),
            templateId: made.templateId,
            expectedRevision: 1,
            name: 'Plan',
            bodyMarkdown: 'Stale text',
          }),
        'conflict',
        'err.templateChanged',
      );
      expectDomain(
        () =>
          service.mutate(who, {
            action: 'delete',
            mutationId: randomUUID(),
            templateId: made.templateId,
            expectedRevision: 1,
            confirmed: true,
          }),
        'conflict',
        'err.templateChanged',
      );
      expect(service.list(who).items[0].bodyMarkdown).toBe('Newer text');
    });
  });

  it('returns the original result for a retried mutation, even after later edits or deletion', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      const createId = randomUUID();
      const first = service.mutate(who, create('Retry me', 'v1', createId));
      expect(service.mutate(who, create('Retry me', 'v1', createId))).toEqual(
        first,
      );

      const updateId = randomUUID();
      const updated = service.mutate(who, {
        action: 'update',
        mutationId: updateId,
        templateId: first.templateId,
        expectedRevision: 1,
        name: 'Retry me',
        bodyMarkdown: 'v2',
      });
      service.mutate(who, {
        action: 'delete',
        mutationId: randomUUID(),
        templateId: first.templateId,
        expectedRevision: 2,
        confirmed: true,
      });
      // The template is gone, yet the old update retry still reports success.
      expect(
        service.mutate(who, {
          action: 'update',
          mutationId: updateId,
          templateId: first.templateId,
          expectedRevision: 1,
          name: 'Retry me',
          bodyMarkdown: 'v2',
        }),
      ).toEqual(updated);
      expect(service.list(who).items).toEqual([]);
    });
  });

  it('rejects a reused mutation ID with different content', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      const mutationId = randomUUID();
      service.mutate(who, create('One', 'a', mutationId));
      expectDomain(
        () => service.mutate(who, create('One', 'b', mutationId)),
        'mutation-mismatch',
        'err.templateMutationMismatch',
      );
    });
  });

  it('reports a missing template as not found', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      expectDomain(
        () =>
          service.mutate(who, {
            action: 'delete',
            mutationId: randomUUID(),
            templateId: randomUUID(),
            expectedRevision: 1,
            confirmed: true,
          }),
        'not-found',
        'err.templateNotFound',
      );
    });
  });

  it('has no template count limit', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      for (let i = 0; i < 150; i++)
        service.mutate(who, create(`Template ${i}`));
      expect(service.list(who).items).toHaveLength(150);
    });
  });

  it('requires a current session for reads and writes', async () => {
    await withPersistence((p) => {
      const who = identity(p);
      const service = new TemplateService(p);
      service.mutate(who, create('Private'));
      p.write((tx) => tx.update(sessions).set({ revokedAt: Date.now() }).run());
      expect(() => service.list(who)).toThrow();
      expect(() => service.mutate(who, create('After revoke'))).toThrow();
    });
  });
});

describe('templates schema', () => {
  it('is schema version 3 and enforces its own invariants in SQLite', async () => {
    await withPersistence((p) => {
      expect(SCHEMA_VERSION).toBe(3);
      expect(p.native.pragma('user_version', { simple: true })).toBe(3);
      const now = Date.now();
      expect(() =>
        p.native
          .prepare(
            'INSERT INTO note_templates (id,name,name_key,body_markdown,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
          )
          .run(randomUUID(), 'x', 'x', '', 1, now, now),
      ).toThrow();
      expect(() =>
        p.native
          .prepare(
            'INSERT INTO note_templates (id,name,name_key,body_markdown,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
          )
          .run(randomUUID(), 'x', 'x', 'body', 0, now, now),
      ).toThrow();
    });
  });

  it('keeps settings reads unaffected by the new tables', async () => {
    await withPersistence((p) => {
      expect(p.db.select().from(appSettings).all()).toHaveLength(1);
      expect(p.db.select().from(noteTemplates).all()).toEqual([]);
    });
  });
});
