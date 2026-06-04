import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { environments } from './environment';

export const environmentVariables = sqliteTable('environment_variables', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  environmentId: text('environment_id')
    .notNull()
    .references(() => environments.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false)
});

export type EnvironmentVariable = typeof environmentVariables.$inferSelect;
export type NewEnvironmentVariable = typeof environmentVariables.$inferInsert;
