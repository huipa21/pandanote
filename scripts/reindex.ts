import { PrivateStorage } from '../src/lib/server/storage/private-storage.ts';
import { Persistence } from '../src/lib/server/db/connection.ts';
import { reindexSearch } from '../src/lib/server/search/index.ts';

// Operator-only repair. Stop the single application instance first. Content,
// revisions, receipts and files are untouched. No note text/query is logged.
try {
  if (process.argv.length !== 2)
    throw new Error('reindex accepts no arguments');
  const p = new Persistence(new PrivateStorage());
  try {
    const count = reindexSearch(p);
    console.info(`Search rebuilt atomically for ${count} notes.`);
  } finally {
    await p.close();
  }
} catch {
  console.error(
    'Search rebuild failed; previous index retained. Check migrations and private storage with the app stopped.',
  );
  process.exitCode = 1;
}
