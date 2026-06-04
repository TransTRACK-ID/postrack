import type { Config } from 'drizzle-kit';

export default {
  schema: './server/db/schema-sqlite/index.ts',
  out: './drizzle-sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || './postrack.db'
  }
} satisfies Config;
