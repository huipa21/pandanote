import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedAccount, withPersistence } from '../helpers/persistence.ts';
import type { Persistence } from '../../src/lib/server/db/connection.ts';
import type { SessionIdentity } from '../../src/lib/server/auth/service.ts';
import { sessions, notes } from '../../src/lib/server/db/schema.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import { timelinePage } from '../../src/lib/server/notes/timeline.ts';
import {
  monthActivity,
  yearActivity,
} from '../../src/lib/server/calendar/activity.ts';
import {
  readSettings,
  updateCalendar,
} from '../../src/lib/server/settings/repository.ts';

function owner(p: Persistence): SessionIdentity {
  const id = seedAccount(p),
    expiresAt = Date.now() + 3_600_000,
    sessionHash = 'd'.repeat(64);
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
    expiresAt,
    securityRevision: 1,
  };
}
function create(
  service: NoteService,
  identity: SessionIdentity,
  date: string,
  body = 'synthetic #Work',
) {
  return service.mutate(identity, {
    action: 'create',
    mutationId: randomUUID(),
    content: {
      bodyMarkdown: body,
      timelineAt: Date.parse(date),
      attachmentIds: [],
      location: null,
    },
  });
}
const query = (value: string) => new URLSearchParams(value);

describe('global calendar and timeline anchors on real SQLite', () => {
  it('year heatmaps equal all twelve month counts, honor DST/leap years, bounds and revoked sessions', async () => {
    await withPersistence((p) => {
      const identity = owner(p),
        service = new NoteService(p);
      updateCalendar(p, identity, {
        timezone: 'America/New_York',
        weekStart: 0,
      });
      create(service, identity, '2024-02-29T12:00Z');
      create(service, identity, '2024-03-10T05:00Z');
      create(service, identity, '2025-01-01T04:59:59Z');
      const trashed = create(service, identity, '2024-06-01T12:00Z');
      service.mutate(identity, {
        action: 'trash',
        noteId: trashed.noteId,
        expectedRevision: 1,
        mutationId: randomUUID(),
      });
      const year = yearActivity(p, identity, 2024);
      expect(year.months).toHaveLength(12);
      expect(year.months[1].counts).toHaveLength(29);
      expect(
        year.months.flatMap((m) => m.counts).reduce((a, b) => a + b, 0),
      ).toBe(3);
      for (const month of year.months)
        expect(month.counts).toEqual(
          monthActivity(p, identity, month.month).counts,
        );
      expect(JSON.stringify(year).length).toBeLessThan(2500);
      expect(yearActivity(p, identity, 9998).months).toHaveLength(12);
      expect(() => yearActivity(p, identity, 1968)).toThrow();
      p.write((tx) =>
        tx
          .delete(sessions)
          .where(eq(sessions.tokenHash, identity.sessionHash))
          .run(),
      );
      expect(() => yearActivity(p, identity, 2024)).toThrow('Sign in');
    });
  });
  it('bounds a dense 10k-note month to counts only and measures warm indexed aggregation', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p);
      p.write((tx) => {
        for (let i = 0; i < 10_000; i++)
          tx.insert(notes)
            .values({
              id: randomUUID(),
              bodyMarkdown: 'Synthetic dense calendar fixture',
              status: 'published',
              timelineAt: Date.parse('2025-03-01T00:00Z') + i * 240_000,
              createdAt: 1,
              updatedAt: 1,
              revision: 1,
            })
            .run();
      });
      const samples: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        const activity = monthActivity(p, identity, '2025-03');
        samples.push(performance.now() - start);
        expect(activity.counts.reduce((a, b) => a + b, 0)).toBe(10_000);
        expect(JSON.stringify(activity).length).toBeLessThan(500);
      }
      samples.sort((a, b) => a - b);
      process.stdout.write(
        `S11 dense 10k month: counts-only warm p50=${samples[15].toFixed(2)}ms p95=${samples[28].toFixed(2)}ms, 31 daily counts.\n`,
      );
    });
  });
  it('groups Hong Kong/Tokyo midnight, leap/year boundaries; status/date/republish/restore mutations immediately change global counts', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p),
        service = new NoteService(p);
      updateCalendar(p, identity, { timezone: 'Asia/Hong_Kong', weekStart: 0 });
      const a = create(service, identity, '2024-02-28T15:59:59.999Z');
      const b = create(
        service,
        identity,
        '2024-02-28T16:00Z',
        'different tag #Other',
      );
      create(service, identity, '2024-02-29T15:59:59.999Z');
      create(service, identity, '2024-02-29T16:00Z');
      expect(monthActivity(p, identity, '2024-02').counts.slice(-2)).toEqual([
        1, 2,
      ]);
      expect(monthActivity(p, identity, '2024-03').counts[0]).toBe(1);
      expect(
        (await timelinePage(p, identity, query('tag=work&date=2024-02-29')))
          .items,
      ).toHaveLength(1);
      service.mutate(identity, {
        action: 'trash',
        mutationId: randomUUID(),
        noteId: b.noteId,
        expectedRevision: 1,
      });
      expect(monthActivity(p, identity, '2024-02').counts[28]).toBe(1);
      service.mutate(identity, {
        action: 'restore',
        mutationId: randomUUID(),
        noteId: b.noteId,
        expectedRevision: 2,
      });
      expect(monthActivity(p, identity, '2024-02').counts[28]).toBe(2);
      service.mutate(identity, {
        action: 'trash',
        mutationId: randomUUID(),
        noteId: a.noteId,
        expectedRevision: 1,
      });
      expect(monthActivity(p, identity, '2024-02').counts[27]).toBe(0);
      service.mutate(identity, {
        action: 'restore',
        mutationId: randomUUID(),
        noteId: a.noteId,
        expectedRevision: 2,
      });
      service.mutate(identity, {
        action: 'update',
        mutationId: randomUUID(),
        noteId: a.noteId,
        expectedRevision: 3,
        content: {
          bodyMarkdown: 'backdated',
          timelineAt: Date.parse('2023-12-31T16:00Z'),
          attachmentIds: [],
          location: null,
        },
      });
      expect(monthActivity(p, identity, '2024-02').counts[27]).toBe(0);
      expect(monthActivity(p, identity, '2024-01').counts[0]).toBe(1);
      updateCalendar(p, identity, { timezone: 'Asia/Tokyo', weekStart: 1 });
      create(service, identity, '2023-12-31T15:00Z');
      expect(monthActivity(p, identity, '2024-01').counts[0]).toBe(2);
      // Epoch-zero is a valid stored date, but western zones display Dec 1969.
      updateCalendar(p, identity, {
        timezone: 'America/Los_Angeles',
        weekStart: 1,
      });
      const epoch = create(
        service,
        identity,
        '1970-01-01T00:00Z',
        'earliest #Epoch',
      );
      expect(monthActivity(p, identity, '1969-12').counts[30]).toBe(1);
      const earliest = await timelinePage(
        p,
        identity,
        query('tag=epoch&date=1969-12-31'),
      );
      expect(earliest.items.map((n) => n.id)).toEqual([epoch.noteId]);
      expect(earliest.filters.day!.start).toBeLessThan(0);
      expect(
        (await timelinePage(p, identity, query('month=1969-12'))).items[0].id,
      ).toBe(epoch.noteId);
      expect(readSettings(p).theme).toBe('system');
    });
  });
  it('uses DST half-open days for counts and locked paging and rejects prior-timezone cursors', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p),
        service = new NoteService(p);
      updateCalendar(p, identity, {
        timezone: 'America/New_York',
        weekStart: 1,
      });
      create(service, identity, '2025-03-09T04:59:59.999Z');
      for (let i = 0; i < 35; i++)
        create(
          service,
          identity,
          i % 2 ? '2025-03-09T05:00Z' : '2025-03-10T03:59:59.999Z',
        );
      create(service, identity, '2025-03-10T04:00Z');
      expect(monthActivity(p, identity, '2025-03').counts.slice(7, 10)).toEqual(
        [1, 35, 1],
      );
      const first = await timelinePage(p, identity, query('date=2025-03-09'));
      const second = await timelinePage(
        p,
        identity,
        query(`date=2025-03-09&cursor=${first.nextCursor}`),
      );
      expect(first.items.length + second.items.length).toBe(35);
      expect(second.nextCursor).toBeNull();
      expect(first.filters.day!.end - first.filters.day!.start).toBe(
        23 * 3_600_000,
      );
      updateCalendar(p, identity, { timezone: 'UTC', weekStart: 1 });
      await expect(
        timelinePage(
          p,
          identity,
          query(`date=2025-03-09&cursor=${first.nextCursor}`),
        ),
      ).rejects.toThrow('different filters');
      expect(
        (await timelinePage(p, identity, query('date=2025-03-09'))).filters.day!
          .end -
          (await timelinePage(p, identity, query('date=2025-03-09'))).filters
            .day!.start,
      ).toBe(24 * 3_600_000);
      updateCalendar(p, identity, {
        timezone: 'America/New_York',
        weekStart: 1,
      });
      create(service, identity, '2025-11-02T05:30Z');
      create(service, identity, '2025-11-02T06:30Z');
      expect(monthActivity(p, identity, '2025-11').counts[1]).toBe(2);
    });
  });
  it('manual empty months stay empty with a resumable older cursor; sparse filtered scrolling skips empty months and search defaults to all dates', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p),
        service = new NoteService(p);
      create(service, identity, '2025-12-01T00:00Z', 'new #Other');
      const older = create(
        service,
        identity,
        '2023-01-01T00:00Z',
        '香港 #Work',
      );
      const empty = await timelinePage(
        p,
        identity,
        query('month=2025-11&tag=work'),
      );
      expect(empty.items).toEqual([]);
      expect(empty.emptyMonth).toBe(true);
      const next = await timelinePage(
        p,
        identity,
        query(`month=2025-11&tag=work&cursor=${empty.nextCursor}`),
      );
      expect(next.items.map((n) => n.id)).toEqual([older.noteId]);
      expect(next.nextCursor).toBeNull();
      await expect(
        timelinePage(
          p,
          identity,
          query(`month=2025-10&tag=work&cursor=${empty.nextCursor}`),
        ),
      ).rejects.toThrow('different filters');
      const search = await timelinePage(p, identity, query('q=香港'));
      expect(search.anchor).toBeNull();
      expect(search.items[0].id).toBe(older.noteId);
      expect(monthActivity(p, identity, '2025-12').counts[0]).toBe(1);
      const month = await timelinePage(p, identity, query('month=2025-12'));
      expect(month.emptyMonth).toBe(false);
      expect(month.items.map((n) => n.id)).toEqual([
        month.items[0].id,
        older.noteId,
      ]);
      expect(monthActivity(p, identity, '2023-01').counts[0]).toBe(1);
    });
  });
  it('counts/settings recheck revoked access and strict preferences do not overwrite unrelated settings', async () => {
    await withPersistence(async (p) => {
      const identity = owner(p);
      expect(() =>
        updateCalendar(p, identity, {
          timezone: 'UTC',
          weekStart: 1,
          theme: 'dark',
        }),
      ).toThrow();
      expect(() => monthActivity(p, identity, '2026-13')).toThrow();
      p.write((tx) =>
        tx
          .delete(sessions)
          .where(eq(sessions.tokenHash, identity.sessionHash))
          .run(),
      );
      expect(() => monthActivity(p, identity, '2026-01')).toThrow();
      expect(() =>
        updateCalendar(p, identity, { timezone: 'UTC', weekStart: 1 }),
      ).toThrow();
    });
  });
});
