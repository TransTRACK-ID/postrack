import type { Config } from 'drizzle-kit';
import { resolve } from 'path';

export default {
  schema: './server/db/schema-sqlite/index.ts',
  out: './drizzle-sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolve(process.cwd(), 'postrack.db')
  }
} satisfies Config;
