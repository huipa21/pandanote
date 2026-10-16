import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  initializeBatchSchema,
  fileIconKind,
  fileExtensionLabel,
  fileBrandMark,
  formatFileSize,
} from '../../src/lib/shared/attachments.ts';
import {
  DiskBudget,
  ImageQueue,
} from '../../src/lib/server/attachments/resources.ts';
import { downloadDisposition } from '../../src/lib/server/attachments/files.ts';
import { WriteCoordinator } from '../../src/lib/server/maintenance/coordinator.ts';

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
describe('attachment bounds and contracts', () => {
  it('rejects duplicate/path IDs, header controls, oversized manifests and invalid checksums', () => {
    const item = {
      id: randomUUID(),
      filename: '香港";.txt',
      incomingBytes: 20,
      incomingDigest: 'a'.repeat(64),
    };
    const base = {
      mutationId: randomUUID(),
      requestDigest: 'b'.repeat(64),
      items: [item],
    };
    expect(initializeBatchSchema.safeParse(base).success).toBe(true);
    for (const items of [
      [item, item],
      [{ ...item, id: '../x' }],
      [{ ...item, filename: 'name\r\ninject' }],
      [{ ...item, incomingDigest: 'bad' }],
      Array.from({ length: 101 }, () => ({ ...item, id: randomUUID() })),
    ])
      expect(initializeBatchSchema.safeParse({ ...base, items }).success).toBe(
        false,
      );
    expect(downloadDisposition(item.filename)).toContain(
      "filename*=UTF-8''%E9%A6%99%E6%B8%AF__.txt",
    );
    expect(downloadDisposition('../../file.txt')).not.toContain('../');
  });
  it('accounts for concurrent disk reservations and releases capacity', () => {
    const disk = new DiskBudget('/unused', 100, () => ({
      available: 1000,
      total: 2000,
    }));
    const release = disk.claim(700);
    expect(() => disk.claim(201)).toThrow(/disk space/);
    const releaseSecond = disk.claim(200);
    releaseSecond();
    release();
    disk.claim(900)();
    const defaults = new DiskBudget('/unused', undefined, () => ({
      available: 6 * 1024 ** 3,
      total: 100 * 1024 ** 3,
    }));
    expect(() => defaults.claim(1)).toThrow(/disk space/);
  });
  it('bounds queue length, times out waiting work without executing it, and recovers on errors', async () => {
    const queue = new ImageQueue(1, 10);
    const first = queue.run(() => wait(30));
    let called = false;
    const second = queue.run(async () => {
      called = true;
    });
    await expect(queue.run(async () => {})).rejects.toThrow(/busy/);
    await expect(second).rejects.toThrow(/timed out/);
    await first;
    expect(called).toBe(false);
    await expect(
      queue.run(async () => {
        throw new Error('synthetic');
      }),
    ).rejects.toThrow('synthetic');
    expect(await queue.run(async () => 'next')).toBe('next');
  });
  it('an admitted async writer can commit while maintenance drains; its capability expires afterward', async () => {
    const gate = new WriteCoordinator();
    let commit!: () => void;
    let captured!: Parameters<Parameters<WriteCoordinator['writeAsync']>[0]>[0];
    const work = gate.writeAsync(async (lease) => {
      captured = lease;
      await new Promise<void>((resolve) => {
        commit = resolve;
      });
      return lease.write(() => 'committed');
    });
    const exclusive = gate.exclusive(async () => 'snapshot');
    expect(gate.state).toBe('draining');
    expect(() => gate.write(() => {})).toThrow(/Maintenance/);
    commit();
    expect(await work).toBe('committed');
    expect(await exclusive).toBe('snapshot');
    expect(() => captured.write(() => {})).toThrow(/expired/);
  });
  it('derives a presentation-only file icon category and extension label', () => {
    expect(fileIconKind('clip.mp4')).toBe('video');
    expect(fileIconKind('song.MP3')).toBe('audio');
    expect(fileIconKind('diagram.svg')).toBe('image');
    expect(fileIconKind('index.ts')).toBe('code');
    expect(fileIconKind('notes.txt')).toBe('text');
    expect(fileIconKind('report.PDF')).toBe('pdf');
    expect(fileIconKind('memo.docx')).toBe('word');
    expect(fileIconKind('budget.XLSX')).toBe('excel');
    expect(fileIconKind('deck.pptx')).toBe('powerpoint');
    expect(fileIconKind('backup.zip')).toBe('archive');
    expect(fileIconKind('install.exe')).toBeNull();
    expect(fileIconKind('no-extension')).toBeNull();
    expect(fileExtensionLabel('install.exe')).toBe('EXE');
    expect(fileExtensionLabel('archive.tar')).toBe('TAR');
    expect(fileExtensionLabel('香港.EXE')).toBe('EXE');
    expect(fileExtensionLabel('no-extension')).toBe('');
    expect(fileBrandMark('word')).toBe('W');
    expect(fileBrandMark('excel')).toBe('X');
    expect(fileBrandMark('powerpoint')).toBe('P');
    expect(fileBrandMark('pdf')).toBe('PDF');
    expect(fileBrandMark('archive')).toBe('ZIP');
    expect(fileBrandMark('text')).toBeNull();
  });
  it('formats a file size as bytes, KB or MB', () => {
    expect(formatFileSize(0)).toEqual({
      key: 'note.bytes',
      params: { count: 0 },
    });
    expect(formatFileSize(1023)).toEqual({
      key: 'note.bytes',
      params: { count: 1023 },
    });
    expect(formatFileSize(1024)).toEqual({
      key: 'note.kilobytes',
      params: { value: '1' },
    });
    expect(formatFileSize(1536)).toEqual({
      key: 'note.kilobytes',
      params: { value: '1.5' },
    });
    expect(formatFileSize(1024 * 1024 - 1)).toEqual({
      key: 'note.kilobytes',
      params: { value: '1024' },
    });
    expect(formatFileSize(1024 * 1024)).toEqual({
      key: 'note.megabytes',
      params: { value: '1' },
    });
    expect(formatFileSize(5 * 1024 * 1024 + 512 * 1024)).toEqual({
      key: 'note.megabytes',
      params: { value: '5.5' },
    });
  });
});
