import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Minimal table proving the Drizzle + expo-sqlite migration path runs.
 * This is not the application's data model — later stages own that.
 */
export const appMeta = sqliteTable('app_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
});
