import { defineConfig } from 'drizzle-kit';

// Generation only. No schema-push shortcut or live database credentials.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/server/db/schema.ts',
  out: './migrations',
  strict: true,
});
