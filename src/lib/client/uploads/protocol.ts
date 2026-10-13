import type {
  ApiError,
  ApiResult,
  MutationResult,
} from '#lib/shared/domain.ts';
import { tr, trError } from '#lib/client/i18n-current.ts';
import { mutationResultSchema } from '#lib/shared/domain.ts';
import type {
  InitializeBatchResult,
  ReadyAttachment,
} from '#lib/shared/attachments.ts';
import { commandDigest, sha256, type PostingAttempt } from './attempt.ts';

export class PostingError extends Error {
  readonly detail: ApiError;
  constructor(detail: ApiError) {
    super(trError(detail));
    this.detail = detail;
  }
}
export interface PostingTransport {
  initialize(attempt: PostingAttempt): Promise<InitializeBatchResult>;
  upload(
    batchId: string,
    id: string,
    blob: Blob,
    progress: (loaded: number) => void,
  ): Promise<ReadyAttachment>;
  commit(attempt: PostingAttempt): Promise<MutationResult>;
}
async function responseData<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResult<T>;
  if (!result.ok) throw new PostingError(result.error);
  if (!response.ok) throw new Error(tr('proto.unexpected'));
  return result.data;
}
export const browserPostingTransport: PostingTransport = {
  async initialize(attempt) {
    return responseData<InitializeBatchResult>(
      await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(attempt.manifest),
        signal: AbortSignal.timeout(30_000),
      }),
    );
  },
  upload(batchId, id, blob, progress) {
    // XHR exposes actual request-byte progress; processing is a separate visible
    // state after all bytes are sent. Inputs remain in the in-memory editor on every error.
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/uploads/${batchId}/${id}`);
      xhr.setRequestHeader('content-type', 'application/octet-stream');
      xhr.timeout = 120_000;
      xhr.upload.onprogress = (event) => progress(event.loaded);
      xhr.onerror =
        xhr.ontimeout =
        xhr.onabort =
          () => reject(new Error(tr('proto.interrupted')));
      xhr.onload = () => {
        try {
          const result = JSON.parse(
            xhr.responseText,
          ) as ApiResult<ReadyAttachment>;
          if (!result.ok) reject(new PostingError(result.error));
          else if (xhr.status >= 200 && xhr.status < 300) resolve(result.data);
          else reject(new Error(tr('proto.unexpectedUpload')));
        } catch (error) {
          reject(error);
        }
      };
      xhr.send(blob);
    });
  },
  async commit(attempt) {
    const command = attempt.command;
    const path =
      command.action === 'create'
        ? '/api/notes'
        : `/api/notes/${'noteId' in command ? command.noteId : ''}${command.action === 'update' ? '' : '/actions'}`;
    return mutationResultSchema.parse(
      await responseData(
        await fetch(path, {
          method: command.action === 'update' ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(command),
          signal: AbortSignal.timeout(30_000),
        }),
      ),
    );
  },
};
export interface PostingProgress {
  stage: string;
  completed: number;
  total: number;
  loaded: number;
  bytes: number;
}
/** Receipt-first on EVERY retry. Record the frozen identity and phase transitions
 * in the mounted editor before networking; no browser recovery storage. */
export async function runPosting(
  initial: PostingAttempt,
  blobFor: (id: string) => Promise<Blob | undefined>,
  persist: (attempt: PostingAttempt) => Promise<void>,
  progress: (value: PostingProgress) => void,
  transport: PostingTransport = browserPostingTransport,
  beforeUpload: () => Promise<void> = async () => {},
): Promise<MutationResult> {
  let attempt = initial;
  if ((await commandDigest(attempt.command)) !== attempt.manifest.requestDigest)
    throw new PostingError({
      code: 'mutation-mismatch',
      message: tr('proto.damaged'),
    });
  const show = (stage: string, completed = 0, loaded = 0, bytes = 0) =>
    progress({
      stage,
      completed,
      total: attempt.manifest.items.length,
      loaded,
      bytes,
    });
  show(tr('proto.checking'));
  const initialized = await transport.initialize(attempt);
  if (initialized.state === 'confirmed') {
    const result = mutationResultSchema.parse(initialized.result);
    await persist({ ...attempt, phase: 'confirmed', result });
    return result;
  }
  if (attempt.phase === 'confirmed')
    throw new PostingError({
      code: 'conflict',
      message: tr('proto.unrecognized'),
    });
  await beforeUpload();
  const batch = initialized.batch;
  attempt = {
    ...attempt,
    phase: 'uploading',
    batchId: batch.id,
    readyIds: batch.attachments
      .filter((a) => a.readiness === 'ready')
      .map((a) => a.id),
  };
  await persist(attempt);
  for (const item of attempt.manifest.items) {
    if (attempt.readyIds.includes(item.id)) continue;
    const blob = await blobFor(item.id);
    if (
      !blob ||
      blob.size !== item.incomingBytes ||
      (await sha256(blob)) !== item.incomingDigest
    )
      throw new PostingError({
        code: 'validation',
        message: tr('proto.bytesMissing', { name: item.filename }),
      });
    const completed = attempt.readyIds.length;
    show(
      tr('proto.uploading', { name: item.filename }),
      completed,
      0,
      blob.size,
    );
    const ready = await transport.upload(batch.id, item.id, blob, (loaded) =>
      show(
        loaded >= blob.size
          ? tr('proto.processing', { name: item.filename })
          : tr('proto.uploading', { name: item.filename }),
        completed,
        loaded,
        blob.size,
      ),
    );
    if (ready.id !== item.id || ready.readiness !== 'ready')
      throw new Error(tr('proto.notReady'));
    attempt = { ...attempt, readyIds: [...attempt.readyIds, item.id] };
    await persist(attempt);
  }
  attempt = { ...attempt, phase: 'committing' };
  await persist(attempt);
  show(tr('proto.savingComplete'), attempt.readyIds.length);
  const result = mutationResultSchema.parse(await transport.commit(attempt));
  await persist({ ...attempt, phase: 'confirmed', result });
  return result;
}
