import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * minimal table proving the Drizzle + expo-sqlite migration path runs.
 * this is not the application's data model — later stages own that.
 */
export const appMeta = sqliteTable('app_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
});
