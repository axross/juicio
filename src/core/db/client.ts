import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

const sqliteDatabase = openDatabaseSync('juicio.db');

export const db = drizzle(sqliteDatabase);
