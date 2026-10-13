import { tr } from '#lib/client/i18n-current.ts';
import { z } from 'zod';
import {
  idSchema,
  revisionSchema,
  type ApiResult,
  type MutationResult,
  type NoteSnapshot,
} from '#lib/shared/domain.ts';
import type { ListStatus } from '#lib/shared/status-notes.ts';
const actionSchema = z.enum([
  'trash',
  'restore',
  'permanent-delete',
  'pin',
  'unpin',
]);
const attemptSchema = z.strictObject({
  mutationId: idSchema,
  noteId: idSchema,
  expectedRevision: revisionSchema,
  action: actionSchema,
  confirmed: z.literal(true).optional(),
});
type Attempt = z.infer<typeof attemptSchema>;
export type LifecycleTarget = {
  id: string;
  revision: number;
  status: ListStatus | 'published';
  priorStatus: 'published' | null;
};
export const LIFECYCLE = Symbol('note lifecycle');
/** Content-free durable retries. A timeout/navigation never changes command identity. */
export class LifecycleState {
  pending = $state<Attempt[]>([]);
  selected = $state<{
    target: LifecycleTarget;
    action: Attempt['action'];
    attempt?: Attempt;
    /** Sent immediately without a dialog; the dialog opens only on failure. */
    silent?: boolean;
  } | null>(null);
  busy = $state(false);
  ready = $state(false);
  error = $state('');
  warning = $state('');
  observed = $state<NoteSnapshot | null>(null);
  readonly key: string;
  private onSaved: (result: MutationResult) => void;
  constructor(accountId: string, onSaved: (result: MutationResult) => void) {
    this.key = `pandanote:lifecycle:v1:${accountId}`;
    this.onSaved = onSaved;
  }
  start() {
    try {
      const items: Attempt[] = [];
      this.warning = '';
      for (const key of Object.keys(localStorage).filter((key) =>
        key.startsWith(this.key + ':'),
      )) {
        try {
          const item = attemptSchema.parse(
            JSON.parse(localStorage.getItem(key)!),
          );
          if (key !== `${this.key}:${item.mutationId}`) throw new Error();
          items.push(item);
        } catch {
          this.warning = tr('life.unreadable');
        }
      }
      this.pending = items;
      this.ready = true;
    } catch {
      this.warning = tr('life.storageUnavailable');
    }
  }
  choose(target: LifecycleTarget, action: Attempt['action']) {
    this.selected = { target, action };
    this.error = '';
    this.observed = null;
  }
  /** Persist the retry record and send now. No confirmation step: failures open the
   * lifecycle dialog in its error state (retry the same action, inspect, refresh). */
  run(target: LifecycleTarget, action: Attempt['action']): Promise<void> {
    if (this.busy || !this.ready) return Promise.resolve();
    this.selected = { target, action, silent: true };
    this.error = '';
    this.observed = null;
    return this.confirm();
  }
  resume(attempt: Attempt) {
    this.selected = {
      target: {
        id: attempt.noteId,
        revision: attempt.expectedRevision,
        status:
          attempt.action === 'restore' || attempt.action === 'permanent-delete'
            ? 'trash'
            : 'published',
        priorStatus: null,
      },
      action: attempt.action,
      attempt,
    };
    this.error = '';
    this.observed = null;
  }
  private persist(items: Attempt[]) {
    if (items.length > 100) throw new Error(tr('life.tooMany'));
    // Independent immutable records avoid two tabs overwriting a shared index.
    for (const item of items)
      if (!this.pending.some((a) => a.mutationId === item.mutationId))
        localStorage.setItem(
          `${this.key}:${item.mutationId}`,
          JSON.stringify(item),
        );
    for (const item of this.pending)
      if (!items.some((a) => a.mutationId === item.mutationId))
        localStorage.removeItem(`${this.key}:${item.mutationId}`);
    this.start();
  }
  forget(attempt: Attempt) {
    try {
      this.persist(
        this.pending.filter((a) => a.mutationId !== attempt.mutationId),
      );
      this.selected = null;
    } catch {
      this.error = tr('life.storageFailed');
    }
  }
  async confirm() {
    if (!this.selected || this.busy || !this.ready) return;
    this.busy = true;
    this.error = '';
    const selected = this.selected;
    try {
      if (!selected.attempt) {
        const attempt = attemptSchema.parse({
          mutationId: crypto.randomUUID(),
          noteId: selected.target.id,
          expectedRevision: selected.target.revision,
          action: selected.action,
          ...(selected.action === 'permanent-delete'
            ? { confirmed: true }
            : {}),
        });
        try {
          this.persist([...this.pending, attempt]); // Confirm durability before any request.
        } catch {
          this.error = tr('life.notSent');
          this.selected = { ...selected, silent: false };
          return;
        }
        this.selected = { ...selected, attempt };
      }
      const attempt = this.selected!.attempt!;
      const response = await fetch(`/api/notes/${attempt.noteId}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(attempt),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as ApiResult<MutationResult>;
      if (!payload.ok) {
        this.observed = payload.error.conflict ?? null;
        throw new Error(payload.error.message);
      }
      this.onSaved(payload.data); // Receipt is authoritative, even if retry cleanup fails.
      this.persist(
        this.pending.filter((a) => a.mutationId !== attempt.mutationId),
      );
      this.selected = null;
    } catch (error) {
      // A failed immediate action surfaces its dialog (retry, inspect, refresh).
      if (this.selected) this.selected = { ...this.selected, silent: false };
      this.error =
        (error instanceof Error && error.name !== 'AbortError'
          ? error.message
          : tr('life.interrupted')) + tr('life.notOverwritten');
    } finally {
      this.busy = false;
    }
  }
}
